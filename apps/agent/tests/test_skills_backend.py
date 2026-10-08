import asyncio
from types import SimpleNamespace

from deepagents import create_deep_agent
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from src.skills_backend import SKILLS_SOURCE, create_agent_backend


def backend():
    return create_agent_backend(SimpleNamespace(state={"files": {}}, store=None))


def test_skill_resources_are_readable_and_scratch_files_stay_in_state():
    storage = backend()
    path = "/skills/3dviz-pro-max/SKILL.md"
    response = storage.download_files([path])[0]
    assert response.error is None
    assert b"generateSandboxedUi" in response.content
    reference = storage.read("/skills/3dviz-pro-max/references/project-sandbox.md")
    assert "OrbitControls" in reference
    result = storage.write("/scratch.txt", "temporary")
    assert result.error is None
    assert result.files_update is not None
    assert "scratch.txt" in str(result.files_update)


def test_packaged_skills_reject_sync_and_async_mutations():
    storage = backend()
    path = "/skills/3dviz-pro-max/SKILL.md"
    original = storage.download_files([path])[0].content
    assert storage.write(path, "replacement").error
    assert storage.edit(path, "3Dviz", "Changed").error
    assert storage.upload_files([(path, b"replacement")])[0].error == "permission_denied"
    assert asyncio.run(storage.awrite(path, "replacement")).error
    assert asyncio.run(storage.aedit(path, "3Dviz", "Changed")).error
    assert asyncio.run(storage.aupload_files([(path, b"replacement")]))[0].error
    assert storage.download_files([path])[0].content == original


def test_real_graph_injects_skill_metadata_into_model_request():
    observed = []

    class FakeModel(FakeListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    class Capture(AgentMiddleware):
        def wrap_model_call(self, request, handler):
            observed.append(request.system_message.content)
            return handler(request)

        async def awrap_model_call(self, request, handler):
            observed.append(request.system_message.content)
            return await handler(request)

    graph = create_deep_agent(
        model=FakeModel(responses=["ok"]), backend=create_agent_backend,
        skills=[SKILLS_SOURCE], middleware=[Capture()],
    )
    for run in (graph.invoke, lambda state: asyncio.run(graph.ainvoke(state))):
        run({"messages": [{"role": "user", "content": "测试技能发现"}]})
        assert "/skills/3dviz-pro-max/SKILL.md" in observed[-1]
        assert all(name in observed[-1] for name in (
            "Advanced Visualization Techniques", "Master Agent Playbook", "SVG Diagram Generation",
        ))
