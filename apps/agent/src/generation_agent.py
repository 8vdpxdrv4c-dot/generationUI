"""Keep frontend activity messages out of LangChain's chat message converter."""
import logging
import json

from ag_ui.core import ActivitySnapshotEvent, EventType, RunErrorEvent, ToolCallArgsEvent
from copilotkit import LangGraphAGUIAgent
from src.generation_output import UI_TOOL, MAX_UI_BYTES, ui_output_error

logger = logging.getLogger(__name__)


def normalize_generation_input(input_data):
    messages = []
    latest_ui = None
    selected_ui = None
    selected_id = (input_data.state or {}).get("selected_generated_ui_id")
    for message in input_data.messages:
        if message.role == "activity":
            if getattr(message, "activity_type", None) == "open-generative-ui":
                latest_ui = {"id": message.id, "content": message.content}
                if message.id == selected_id:
                    selected_ui = latest_ui
            continue
        messages.append(message)
    state = dict(input_data.state or {})
    explicit_ui = state.get("current_generated_ui")
    # Frontend shared state survives adapters which remove activity messages.
    # A matching explicit selection is newer than replayed generation snapshots.
    current_ui = explicit_ui if (isinstance(explicit_ui, dict) and explicit_ui.get("id") == selected_id
        and isinstance(explicit_ui.get("content"), dict)) else selected_ui or latest_ui
    if current_ui is not None:
        content = dict(current_ui["content"])
        edited_html = content.pop("editedHtml", None)
        content.pop("editRevision", None)
        if isinstance(edited_html, str):
            content["html"] = [edited_html]
        state["current_generated_ui"] = {**current_ui, "content": content}
    return input_data.model_copy(update={"messages": messages, "state": state})


class GenerationAGUIAgent(LangGraphAGUIAgent):
    async def run(self, input):
        # Large tool arguments used to be reparsed and rerendered for every
        # token, including output the provider had truncated. Buffer just UI
        # calls, bounded in size, until the source has passed validation.
        pending = {}
        try:
            async for event in super().run(normalize_generation_input(input)):
                if event.type == EventType.TOOL_CALL_START and event.tool_call_name == UI_TOOL:
                    pending[event.tool_call_id] = {"start": event, "chunks": [], "size": 0}
                    continue
                call = pending.get(getattr(event, "tool_call_id", None))
                if call and event.type == EventType.TOOL_CALL_ARGS:
                    call["size"] += len(event.delta.encode("utf-8"))
                    if call["size"] <= MAX_UI_BYTES:
                        call["chunks"].append(event.delta)
                    continue
                if call and event.type == EventType.TOOL_CALL_END:
                    pending.pop(event.tool_call_id)
                    args = None
                    try:
                        args = json.loads("".join(call["chunks"])) if call["size"] <= MAX_UI_BYTES else None
                    except (ValueError, TypeError):
                        pass
                    error = ui_output_error(args)
                    if error:
                        logger.warning("Discarding incomplete UI tool stream: %s", error)
                        yield ActivitySnapshotEvent(message_id=f"{event.tool_call_id}-activity",
                            activity_type="open-generative-ui",
                            content={"generating": False, "error": f"{error}，本次结果未执行，请重试生成。"})
                        continue
                    yield call["start"]
                    yield ToolCallArgsEvent(tool_call_id=event.tool_call_id,
                        delta=json.dumps(args, ensure_ascii=False))
                    yield event
                    # Canonical final snapshot also covers parser buffer limits
                    # and ensures history receives the complete JS source.
                    yield ActivitySnapshotEvent(message_id=f"{event.tool_call_id}-activity",
                        activity_type="open-generative-ui", content={
                            **args, "html": [args["html"]], "generating": False,
                            "cssComplete": True, "htmlComplete": True,
                            "jsFunctionsComplete": True, "jsExpressionsComplete": True,
                        })
                    continue
                yield event
        except Exception:
            logger.exception("Generation run failed (thread=%s, run=%s)", input.thread_id, input.run_id)
            yield RunErrorEvent(type=EventType.RUN_ERROR, code="GENERATION_FAILED",
                                message="生成服务发生错误，请重试；详细原因已记录到 Agent 服务日志。")
