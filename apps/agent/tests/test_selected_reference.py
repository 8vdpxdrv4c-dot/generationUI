import asyncio

from deepagents import create_deep_agent
from langchain.agents.middleware import ModelRequest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.selected_reference import SelectedReferenceMiddleware, with_selected_reference


def request(state):
    return ModelRequest(model=FakeListChatModel(responses=["ok"]), messages=[HumanMessage(content="生成月度收入图")],
                        system_message=SystemMessage(content="Original instructions"), state=state)


def test_deep_agent_registers_shared_reference_state():
    graph = create_deep_agent(model=FakeListChatModel(responses=["ok"]), middleware=[SelectedReferenceMiddleware()])
    schema = graph.get_input_jsonschema()
    assert {"templates", "pending_template", "pending_design_asset"} <= schema["properties"].keys()


def test_graph_run_preserves_selection_and_delivers_source_to_model():
    observed = []

    class ToolCompatibleFakeModel(FakeListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    class RecordingReferenceMiddleware(SelectedReferenceMiddleware):
        def wrap_model_call(self, request, handler):
            updated = with_selected_reference(request)
            observed.append(updated.system_message.content)
            return handler(updated)

    graph = create_deep_agent(model=ToolCompatibleFakeModel(responses=["ok"]),
                              middleware=[RecordingReferenceMiddleware()])
    selection = {"id": "seed-shadcn-chart-area-gradient", "kind": "component"}
    result = graph.invoke({"messages": [HumanMessage(content="生成月度收入图")], "pending_template": selection})
    assert result["pending_template"] == selection
    assert len(observed) == 1
    assert "linearGradient" in observed[0]


def test_chart_reference_is_injected_without_relying_on_tool_call():
    state = {"pending_template": {"id": "seed-shadcn-chart-area-gradient"},
             "templates": [{"id": "seed-shadcn-chart-area-gradient", "html": "old preview"}]}
    original = request(state)
    updated = with_selected_reference(original)
    text = updated.system_message.content
    assert text.startswith("Original instructions")
    assert "recharts" in text and "linearGradient" in text
    assert "MUST use its visual structure" in text
    assert original.system_message.content == "Original instructions"
    assert updated.state is original.state
    assert state["pending_template"] is not None


def test_saved_native_component_retains_type_and_data():
    updated = with_selected_reference(request({"pending_template": {"id": "saved-chart"}, "templates": [{
        "id": "saved-chart", "name": "业务图表", "description": "柱状图", "component_type": "barChart",
        "component_data": {"data": [{"label": "收入", "value": 100}]}, "kind": "component",
    }]}))
    assert '"component_type": "barChart"' in updated.system_message.content
    assert '"value": 100' in updated.system_message.content


def test_no_selection_and_missing_reference():
    original = request({})
    assert with_selected_reference(original) is original
    missing = with_selected_reference(request({"pending_template": {"id": "missing"}}))
    assert "not found" in missing.system_message.content


def test_async_model_path_injects_reference():
    async def handler(updated):
        assert "linearGradient" in updated.system_message.content
        return "handled"
    middleware = SelectedReferenceMiddleware()
    result = asyncio.run(middleware.awrap_model_call(request({"pending_template": {"id": "seed-shadcn-chart-area-gradient"}}), handler))
    assert result == "handled"
