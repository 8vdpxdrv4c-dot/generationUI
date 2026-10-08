import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from src.generation_output import NODE_EXECUTABLE
from ag_ui.core import ToolCallStartEvent, ToolCallArgsEvent, ToolCallEndEvent
from copilotkit import LangGraphAGUIAgent
from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.generation_output import CompleteUIOutputMiddleware, ui_output_error
from src.generation_agent import GenerationAGUIAgent
from ag_ui.core import RunAgentInput


def restored_input():
    return RunAgentInput(thread_id="test", run_id="run", state={}, tools=[], context=[],
                         forwarded_props={}, messages=[{"id": "user", "role": "user", "content": "做齿轮"}])


def complete_args():
    return {"initialHeight": 400, "placeholderMessages": ["正在构建"], "css": "", "html": "<button>暂停</button>",
            "jsFunctions": "async function init() {}", "jsExpressions": ["init();"]}


def response(args):
    return ModelResponse(result=[AIMessage(content="", tool_calls=[{"id": "ui", "name": "generateSandboxedUi", "args": args}])])


def test_validates_missing_js_and_accepts_explicit_static_source():
    args = complete_args()
    assert ui_output_error(args) is None
    del args["jsExpressions"]
    assert "jsExpressions" in ui_output_error(args)
    args.update(html="<p>静态页面</p>", jsFunctions="", jsExpressions=[])
    assert ui_output_error(args) is None


def test_retries_truncated_output_without_replaying_the_bad_call_to_the_model():
    request = ModelRequest(model=SimpleNamespace(), messages=[HumanMessage("做齿轮")])
    attempts = []
    async def handler(next_request):
        attempts.append(next_request)
        args = complete_args()
        if len(attempts) == 1:
            del args["jsExpressions"]
        return response(args)
    result = asyncio.run(CompleteUIOutputMiddleware().awrap_model_call(request, handler))
    assert len(attempts) == 2
    assert result.result[0].tool_calls[0]["args"]["jsExpressions"] == ["init();"]
    assert "上次输出无效" in attempts[1].system_message.content
    assert attempts[1].messages == request.messages
    assert not any(isinstance(message, AIMessage) for message in attempts[1].messages)


def test_stops_after_two_retries_instead_of_marking_broken_source_complete():
    request = ModelRequest(model=SimpleNamespace(), messages=[])
    with pytest.raises(ValueError, match="已重试两次"):
        CompleteUIOutputMiddleware().wrap_model_call(request, lambda _: response({}))


def test_does_not_inject_another_generation_request_after_success():
    request = ModelRequest(model=SimpleNamespace(), messages=[HumanMessage("做齿轮"),
        response(complete_args()).result[0], ToolMessage(content="done", tool_call_id="ui")])
    assert CompleteUIOutputMiddleware.request_for_attempt(request) is request
    followup = request.override(messages=[*request.messages, HumanMessage("改为红色")])
    assert CompleteUIOutputMiddleware.request_for_attempt(followup) is not followup


@pytest.mark.skipif(not NODE_EXECUTABLE, reason="Node syntax checker unavailable")
def test_rejects_malformed_javascript_before_delivery():
    args = complete_args()
    args["jsFunctions"] = "let scene = null; function scene.resize() {}"
    assert "JavaScript 语法错误" in ui_output_error(args)


def test_tool_stream_is_bounded_and_final_snapshot_preserves_full_js():
    async def fake_run(self, input):
        yield ToolCallStartEvent(tool_call_id="ui", tool_call_name="generateSandboxedUi", parent_message_id="ai")
        text = json.dumps(complete_args())
        for chunk in text:
            yield ToolCallArgsEvent(tool_call_id="ui", delta=chunk)
        yield ToolCallEndEvent(tool_call_id="ui")
    async def collect():
        instance = object.__new__(GenerationAGUIAgent)
        return [event async for event in instance.run(restored_input())]
    with patch.object(LangGraphAGUIAgent, "run", fake_run):
        events = asyncio.run(collect())
    assert len(events) == 4
    assert events[-1].content["jsFunctions"] == complete_args()["jsFunctions"]
    assert events[-1].content["jsExpressions"] == ["init();"]
    assert events[-1].content["generating"] is False


def test_invalid_stream_never_reaches_frontend_tool_execution():
    async def fake_run(self, input):
        yield ToolCallStartEvent(tool_call_id="ui", tool_call_name="generateSandboxedUi", parent_message_id="ai")
        yield ToolCallArgsEvent(tool_call_id="ui", delta='{"html":"cut')
        yield ToolCallEndEvent(tool_call_id="ui")
    async def collect():
        instance = object.__new__(GenerationAGUIAgent)
        return [event async for event in instance.run(restored_input())]
    with patch.object(LangGraphAGUIAgent, "run", fake_run):
        events = asyncio.run(collect())
    assert [event.type for event in events] == ["ACTIVITY_SNAPSHOT"]
    assert events[0].content["error"]
