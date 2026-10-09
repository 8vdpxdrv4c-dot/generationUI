"""Tests pinning the prompt contract to the canonical generateSandboxedUi tool."""

import inspect

import src.templates as templates
from src.plan import plan_visualization
from src.prompt import SYSTEM_PROMPT
from src.templates import apply_template


def test_prompt_uses_generate_sandboxed_ui_not_widget_renderer():
    assert "generateSandboxedUi" in SYSTEM_PROMPT
    assert "widgetRenderer" not in SYSTEM_PROMPT


def test_page_height_contract_is_distinct_from_component_height():
    assert 'data-ui-kind="page"' in SYSTEM_PROMPT
    assert 'data-ui-kind="component"' in SYSTEM_PROMPT
    assert "min-height: var(--ui-viewport-height, 100dvh)" in SYSTEM_PROMPT
    assert "outer browser scrollbar" in SYSTEM_PROMPT
    assert "Components retain natural content height" in SYSTEM_PROMPT


def test_prompt_documents_ordered_params():
    # Anchored numbered-list needles pin the full documented stream order —
    # any reordering of the six params breaks the monotone index chain.
    anchored = [
        "1. initialHeight",
        "2. placeholderMessages",
        "3. css",
        "4. html",
        "5. jsFunctions",
        "6. jsExpressions",
    ]
    indices = []
    for needle in anchored:
        idx = SYSTEM_PROMPT.find(needle)
        assert idx >= 0, f"missing ordered param doc: {needle}"
        indices.append(idx)
    assert indices == sorted(indices), "param docs out of order"
    assert "parameter order" in SYSTEM_PROMPT.lower()
    # The order requirement itself must be flagged as exact/critical.
    assert "EXACT order" in SYSTEM_PROMPT


def test_prompt_documents_sandbox_bridge_and_restrictions():
    assert "Websandbox.connection.remote" in SYSTEM_PROMPT
    assert "localStorage" in SYSTEM_PROMPT
    assert "cookies" in SYSTEM_PROMPT.lower()
    assert "same-origin fetch" in SYSTEM_PROMPT.lower()


def test_prompt_preserves_visualization_protocol():
    assert "plan_visualization" in SYSTEM_PROMPT
    assert "NEVER skip the plan_visualization step" in SYSTEM_PROMPT
    assert "Acknowledge" in SYSTEM_PROMPT
    assert "Narrate" in SYSTEM_PROMPT
    assert "query_data" in SYSTEM_PROMPT
    assert "barChart" in SYSTEM_PROMPT
    assert "pieChart" in SYSTEM_PROMPT
    assert "weatherCard" in SYSTEM_PROMPT
    assert "prefer the built-in" in SYSTEM_PROMPT
    assert "Three.js" in SYSTEM_PROMPT
    assert "NEVER fake 3D" in SYSTEM_PROMPT


def test_prompt_documents_library_imports_for_sandbox():
    assert "await import('three')" in SYSTEM_PROMPT
    assert '<script type="module">' in SYSTEM_PROMPT
    assert "bare" in SYSTEM_PROMPT.lower()
    assert "importmap" in SYSTEM_PROMPT.lower().replace(" ", "")


def test_prompt_forbids_top_level_await_in_js_channels():
    # jsFunctions/jsExpressions are executed via websandbox runCode as classic
    # scripts, where top-level await is a SyntaxError that fails silently. The
    # prompt must direct dynamic imports inside async functions.
    normalized = " ".join(SYSTEM_PROMPT.lower().split())
    assert "top-level `await`" in normalized or "top-level await" in normalized
    assert "classic script" in normalized
    assert "inside an async function" in normalized


def test_plan_visualization_docstring_names_canonical_tool():
    assert "generateSandboxedUi" in plan_visualization.description
    assert "widgetRenderer" not in plan_visualization.description


def test_templates_docstrings_name_canonical_tool():
    assert "generateSandboxedUi" in apply_template.description
    assert "widgetRenderer" not in apply_template.description
    assert "widgetRenderer" not in inspect.getsource(templates)


def test_seed_templates_use_sandbox_bridge_not_global_send_prompt():
    invoice = next(t for t in templates.SEED_TEMPLATES if t["id"] == "seed-invoice-001")
    assert invoice["html"], "seed html should load from the frontend source"
    assert "sendPrompt('" not in invoice["html"]
    assert "Websandbox.connection.remote.sendPrompt" in invoice["html"]


class _FakeRuntime:
    state: dict = {}
    tool_call_id = "test-call"


def test_apply_template_appends_canonical_translation_note():
    result = apply_template.func(runtime=_FakeRuntime(), name="发票卡片")
    assert "error" not in result
    note = result.get("usage_note", "")
    assert "css parameter" in note
    assert "jsFunctions" in note
    assert "Websandbox.connection.remote.sendPrompt" in note


def test_templates_support_full_pages_and_request_scoped_edits():
    assert 'Template library (kind="page"): complete pages' in SYSTEM_PROMPT
    assert 'Component library (kind="component"): small widgets' in SYSTEM_PROMPT
    assert "not full pages" not in SYSTEM_PROMPT
    assert "Selecting a template only attaches a reference" in SYSTEM_PROMPT
    assert "full-page\n   redesign or replacement" in SYSTEM_PROMPT
    note = apply_template.func(runtime=_FakeRuntime(), name="发票卡片")["usage_note"]
    assert "apply the full page when explicitly requested" in note
    assert "preserve unrelated" in note
    assert "full page, component or style reference" in apply_template.description


def test_reference_libraries_filter_seeds_and_legacy_records():
    class Runtime:
        state = {"templates": [
            {"id": "old-chart", "name": "chart", "component_type": "barChart", "description": "", "data_description": "", "version": 1},
            {"id": "old-page", "name": "page", "description": "", "data_description": "", "version": 1},
        ]}
    pages = templates.list_templates.func(runtime=Runtime(), kind="page")
    components = templates.list_templates.func(runtime=Runtime(), kind="component")
    expected_pages = {item["id"] for item in templates.SEED_TEMPLATES if templates.reference_kind(item) == "page"}
    assert {item["id"] for item in pages} == {"old-page", *expected_pages}
    assert all(item["kind"] == "page" for item in pages)
    expected_components = {item["id"] for item in templates.SEED_TEMPLATES if templates.reference_kind(item) == "component"}
    assert {item["id"] for item in components} == {"old-chart", *expected_components}
    assert all(item["kind"] == "component" for item in components)


def test_save_reference_keeps_explicit_kind_and_existing_records():
    for kind in ("page", "component"):
        class Runtime:
            state = {"templates": [{"id": "existing"}]}
            tool_call_id = "save-test"
        result = templates.save_template.func(name="test", description="", html="<div/>", data_description="", runtime=Runtime(), kind=kind)
        assert result.update["templates"][0] == {"id": "existing"}
        assert result.update["templates"][-1]["kind"] == kind


def test_apply_reference_returns_kind_and_scope_without_clearing_selection():
    for template_id, kind, scope in (
        ("seed-weather-001", "component", "apply only to the requested local component"),
        ("seed-dashboard-001", "page", "whole-page layout and style reference"),
    ):
        class Runtime:
            state = {"pending_template": {"id": template_id, "kind": kind}}
        runtime = Runtime()
        result = templates.apply_template.func(runtime=runtime)
        assert result["kind"] == kind
        assert scope in result["usage_note"]
        assert runtime.state["pending_template"]["id"] == template_id


def test_prompt_documents_the_redesign_flow():
    """The redesign path must be discoverable from the system prompt alone."""
    assert "pending_design_asset" in SYSTEM_PROMPT
    assert "read_design_asset" in SYSTEM_PROMPT
    assert "clear_pending_design_asset" in SYSTEM_PROMPT
    # The baseline arrives through state, never by asking the user to paste it.
    assert "paste the page" in SYSTEM_PROMPT


def test_design_asset_tools_are_registered():
    from src.design_assets import design_asset_tools

    names = {tool.name for tool in design_asset_tools}
    assert names == {"read_design_asset", "clear_pending_design_asset"}


def test_read_design_asset_returns_the_pending_baseline():
    from src.design_assets import read_design_asset

    baseline = {"id": "a1", "version": 2, "css": ".x{}", "html": "<div></div>"}

    class _FakeRuntime:
        state = {"pending_design_asset": baseline}

    result = read_design_asset.func(runtime=_FakeRuntime())
    for key, value in baseline.items():
        assert result[key] == value
    # The baseline carries the contract reminder for regenerating it.
    assert "generateSandboxedUi" in result["usage_note"]


def test_read_design_asset_reports_a_missing_baseline():
    from src.design_assets import read_design_asset

    class _FakeRuntime:
        state = {}

    result = read_design_asset.func(runtime=_FakeRuntime())
    assert "error" in result


def test_prompt_forbids_repeat_generate_sandboxed_ui_calls():
    # followUp runs return "UI generated" to the agent; without an explicit
    # single-build rule the model rebuilds the widget in a loop.
    from src.prompt import SYSTEM_PROMPT

    assert "at most ONCE" in SYSTEM_PROMPT
    assert "UI generated" in SYSTEM_PROMPT
    assert "do NOT call it again" in SYSTEM_PROMPT
