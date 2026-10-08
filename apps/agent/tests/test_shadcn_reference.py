"""Tests for the source-owned shadcn/ui reference layer."""

from src.prompt import SYSTEM_PROMPT
from src.shadcn_reference import (
    DOC_ONLY_COMPONENTS,
    list_shadcn_components,
    read_shadcn_component,
    shadcn_tools,
)


def test_prompt_documents_shadcn_reference_tools():
    assert "list_shadcn_components" in SYSTEM_PROMPT
    assert "read_shadcn_component" in SYSTEM_PROMPT
    assert "sandbox has no React runtime" in SYSTEM_PROMPT


def test_list_includes_installed_components_and_guide_only_entries():
    result = list_shadcn_components.func()

    assert result["installed_count"] >= 60
    names = {item["name"] for item in result["components"]}
    assert {"button", "dialog", "sidebar"} <= names
    assert set(DOC_ONLY_COMPONENTS) <= names


def test_read_component_is_bounded_and_marks_guide_only_entries():
    button = read_shadcn_component.func(name="button", max_chars=600)
    assert button["name"] == "button"
    assert button["truncated"] is True
    assert len(button["source"]) == 600

    data_table = read_shadcn_component.func(name="data-table")
    assert data_table["installed"] is False
    assert "指南" in data_table["note"]


def test_tools_are_registered():
    assert {tool.name for tool in shadcn_tools} == {
        "list_shadcn_components",
        "read_shadcn_component",
    }


def test_chart_families_and_source_are_available():
    from src.shadcn_reference import chart_references
    from src.templates import SEED_TEMPLATES, reference_payload

    charts = chart_references()
    assert {item["family"] for item in charts} == {"area", "bar", "line", "pie", "radar", "radial", "tooltip"}
    names = {item["name"] for item in list_shadcn_components.func(query="chart-area")["components"]}
    assert "chart-area-gradient" in names
    source = read_shadcn_component.func(name="chart-area-gradient")
    assert "recharts" in source["source"]
    assert source["source_url"].startswith("https://ui.shadcn.com/")
    seed = next(item for item in SEED_TEMPLATES if item["id"] == "seed-shadcn-chart-area-gradient")
    assert reference_payload(seed)["reference_source"] == seed["source"]
    assert reference_payload(seed)["kind"] == "component"
