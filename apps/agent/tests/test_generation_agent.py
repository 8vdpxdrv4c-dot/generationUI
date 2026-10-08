import asyncio
from unittest.mock import patch

from ag_ui.core import RunAgentInput
from ag_ui_langgraph.utils import agui_messages_to_langchain
from copilotkit import LangGraphAGUIAgent

from src.generation_agent import GenerationAGUIAgent, normalize_generation_input


def restored_input():
    return RunAgentInput(thread_id="thread", run_id="run", state={"pending_template": {"id": "selected"}},
                         tools=[], context=[], forwarded_props={}, messages=[
        {"id": "user", "role": "user", "content": "生成页面"},
        {"id": "old", "role": "activity", "activityType": "open-generative-ui", "content": {"html": ["old"]}},
        {"id": "new", "role": "activity", "activityType": "open-generative-ui", "content": {"html": ["new"]}},
        {"id": "reply", "role": "assistant", "content": "完成"},
    ])


def test_restored_activity_is_not_sent_to_chat_converter_but_source_is_preserved():
    original = restored_input()
    normalized = normalize_generation_input(original)
    assert len(agui_messages_to_langchain(normalized.messages)) == 2
    assert normalized.state["current_generated_ui"]["content"]["html"] == ["new"]
    assert normalized.state["pending_template"] == {"id": "selected"}
    assert len(original.messages) == 4
    assert "current_generated_ui" not in original.state


def test_backend_exception_emits_run_error_instead_of_breaking_stream():
    async def failing_run(self, input):
        assert all(message.role != "activity" for message in input.messages)
        raise RuntimeError("provider failure")
        yield

    async def collect():
        instance = object.__new__(GenerationAGUIAgent)
        return [event async for event in instance.run(restored_input())]

    with patch.object(LangGraphAGUIAgent, "run", failing_run):
        events = asyncio.run(collect())
    assert events[-1].type == "RUN_ERROR"
    assert events[-1].code == "GENERATION_FAILED"
