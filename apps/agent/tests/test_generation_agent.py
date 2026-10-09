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


def test_selected_page_manual_edits_are_the_next_model_baseline():
    original = restored_input()
    original.state["selected_generated_ui_id"] = "old"
    original.messages[1].content.update(editedHtml="<h1>手动修改后的标题</h1>", editRevision=3)
    normalized = normalize_generation_input(original)
    assert normalized.state["current_generated_ui"]["id"] == "old"
    assert normalized.state["current_generated_ui"]["content"]["html"] == ["<h1>手动修改后的标题</h1>"]
    assert "editedHtml" not in normalized.state["current_generated_ui"]["content"]
    assert original.messages[1].content["html"] == ["old"]


def test_missing_selection_falls_back_to_latest_page_and_uses_edited_source():
    original = restored_input()
    original.state["selected_generated_ui_id"] = "missing"
    original.messages[2].content.update(editedHtml="new edited", editRevision=1)
    assert normalize_generation_input(original).state["current_generated_ui"]["content"]["html"] == ["new edited"]


def test_explicit_selected_source_survives_filtered_or_stale_activity_messages():
    original = restored_input()
    original.state.update(selected_generated_ui_id="old", current_generated_ui={
        "id": "old", "content": {"html": ["explicit latest source"]}})
    assert normalize_generation_input(original).state["current_generated_ui"]["content"]["html"] == ["explicit latest source"]
    original.messages = [message for message in original.messages if message.role != "activity"]
    assert normalize_generation_input(original).state["current_generated_ui"]["content"]["html"] == ["explicit latest source"]


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
