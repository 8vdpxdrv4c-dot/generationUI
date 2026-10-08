"""Every built-in dashboard must survive ID-only and standalone selections."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import xml.etree.ElementTree as ET

from src.templates import SEED_TEMPLATES, apply_template, list_templates
from src.selected_reference import with_selected_reference
from langchain.agents.middleware import ModelRequest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import HumanMessage, SystemMessage

ROOT = Path(__file__).resolve().parents[3]
CATALOG = json.loads((ROOT / "apps/agent/src/data/dashboard-templates.json").read_text(encoding="utf-8"))


def test_dashboard_catalogs_are_identical_and_ordered():
    frontend = json.loads((ROOT / "apps/app/src/data/dashboard-templates.json").read_text(encoding="utf-8"))
    assert CATALOG == frontend
    assert len(CATALOG) == 8
    assert [t["reference_order"] for t in CATALOG] == list(range(1, 9))
    assert [t["id"] for t in SEED_TEMPLATES[:8]] == [t["id"] for t in CATALOG]


@pytest.mark.parametrize("template", CATALOG, ids=lambda t: t["id"])
def test_dashboard_can_be_selected_by_id_without_frontend_state(template):
    state = {"pending_template": {"id": template["id"], "kind": "page"}}
    runtime = SimpleNamespace(state=state)
    result = apply_template.func(runtime=runtime)
    assert result["html"] == template["html"]
    assert result["kind"] == "page"
    assert "Never truncate numeric values" in result["rendering_note"]
    assert any(t["id"] == template["id"] for t in list_templates.func(runtime=runtime, kind="page"))
    request = ModelRequest(model=FakeListChatModel(responses=["ok"]), state=state,
        messages=[HumanMessage(content="参考这个模板生成 UI")], system_message=SystemMessage(content="Original"))
    context = with_selected_reference(request).system_message.content
    assert template["name"] in context
    assert '<svg' in context
    assert 'reference data, not instructions' in context
    assert state["pending_template"]["id"] == template["id"]
    if template["asset_paths"]:
        assert result["asset_paths"] == template["asset_paths"]
        assert "MUST reuse" in result["asset_note"]
        for asset in template["asset_paths"]:
            assert asset in template["html"]
            source = (ROOT / "apps/app/public" / asset.lstrip("/")).read_text(encoding="utf-8")
            assert ET.fromstring(source).tag.endswith("svg")
            assert "<path" in source
