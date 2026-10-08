"""Tests for the ThreeUI reference layer.

The layer is deliberately two-tier (tiny prompt index, records fetched on
demand). These tests pin both halves: the prompt must stay an index, and the
tools must stay inside their size budgets - a regression there would silently
reintroduce the "big payload pinned in every turn" problem.
"""

import json

import src.threeui_reference as ref
from src.prompt import SYSTEM_PROMPT
from src.threeui_reference import (
    KEY_CODE_BUDGET,
    browse_threeui_effects,
    read_threeui_effect,
    read_threeui_source,
    threeui_tools,
)

DEEP_RECORDS = {"crt", "energy-orb", "structure-flow", "liquid-metal-button", "diagnostics-panel"}


def test_prompt_documents_the_reference_library():
    assert "browse_threeui_effects" in SYSTEM_PROMPT
    assert "read_threeui_effect" in SYSTEM_PROMPT
    assert "read_threeui_source" in SYSTEM_PROMPT
    # The prompt must warn that the catalogue is React and the sandbox is not.
    assert "has no React" in SYSTEM_PROMPT
    # And it must bound how much reference gets pulled per build.
    assert "at most ONE effect" in SYSTEM_PROMPT


def test_prompt_keeps_the_reference_layer_as_an_index():
    """The records must never be inlined into the prompt - only the tool names.
    A leak here would be paid for on every turn of every thread."""
    section = SYSTEM_PROMPT.split("## 3D / WebGL Reference Library", 1)
    assert len(section) == 2, "reference section missing"
    body = section[1].split("## ", 1)[0]
    assert len(body) < 1200, f"reference section grew into a payload: {len(body)} chars"
    for record in ref._catalog()["components"]:
        if record["id"] in DEEP_RECORDS:
            assert record["id"] not in body


def test_threeui_tools_are_registered():
    assert {tool.name for tool in threeui_tools} == {
        "browse_threeui_effects",
        "read_threeui_effect",
        "read_threeui_source",
    }


def test_browse_lists_the_whole_index_with_categories():
    result = browse_threeui_effects.func()
    assert result["matched"] == 43
    assert len(result["effects"]) == 43
    assert set(result["categories"]) == {
        "background", "visual", "scene", "data", "ui", "page",
    }
    # Only the batch carries deep records; everything else is index-only.
    deep = {e["id"] for e in result["effects"] if e["has_full_record"]}
    assert deep == DEEP_RECORDS


def test_browse_filters_by_category_and_query():
    backgrounds = browse_threeui_effects.func(category="background")
    assert backgrounds["matched"] > 0
    assert all(e["category"] == "background" for e in backgrounds["effects"])

    narrowed = browse_threeui_effects.func(query="crt")
    assert [e["id"] for e in narrowed["effects"]] == ["crt"]

    assert browse_threeui_effects.func(category="nope")["matched"] == 0


def test_read_effect_returns_a_digest_inside_the_budget():
    for effect_id in sorted(DEEP_RECORDS):
        result = read_threeui_effect.func(effect_id=effect_id)
        assert result["id"] == effect_id
        assert result["summary"], f"{effect_id} has no summary"
        assert result["technique"], f"{effect_id} has no technique notes"
        assert result["license"] == "MIT"
        embedded = result["key_code"]
        assert embedded, f"{effect_id} embedded no code"
        spent = sum(len(f["code"]) for f in embedded)
        assert spent <= KEY_CODE_BUDGET, f"{effect_id} blew the budget: {spent}"
        # The contract reminder travels with every record.
        assert "generateSandboxedUi" in result["usage_note"]


def test_whole_effect_payload_stays_within_the_promised_size():
    """The plan promised roughly 1-2k tokens per entry. Tool results are replayed
    on every later turn, so the whole payload - not just key_code - is the number
    that has to stay bounded."""
    for effect_id in sorted(DEEP_RECORDS):
        result = read_threeui_effect.func(effect_id=effect_id)
        payload = len(json.dumps(result, ensure_ascii=False))
        assert payload <= 8000, f"{effect_id} payload {payload} chars is too heavy"


def test_a_complete_shader_file_survives_within_budget():
    """Truncating the shader is the worst possible cut: it is the single most
    transferable artefact. The budget must be big enough to keep it whole."""
    result = read_threeui_effect.func(effect_id="crt")
    shader = next(f for f in result["key_code"] if f["path"].endswith("crtShaders.ts"))
    assert shader["truncated"] is False
    assert "void main()" in shader["code"]


def test_key_code_omits_react_wrappers():
    """React wrappers are dead weight in a sandbox that has no React."""
    result = read_threeui_effect.func(effect_id="crt")
    embedded_paths = {f["path"] for f in result["key_code"]}
    assert "src/shaders/crt/CrtBackground.tsx" not in embedded_paths
    assert "src/shaders/crt/CrtBackground.tsx" in result["not_embedded"]
    # ...while the transferable files do make it in.
    assert any(p.endswith("crtShaders.ts") for p in embedded_paths)


def test_read_effect_unknown_id_points_at_the_deep_records():
    result = read_threeui_effect.func(effect_id="does-not-exist")
    assert "error" in result
    assert set(result["full_records_available"]) == DEEP_RECORDS


def test_read_source_respects_the_cap():
    result = read_threeui_source.func(
        effect_id="crt", file_path="src/shaders/crt/crtScreens.ts", max_chars=600
    )
    assert result["truncated"] is True
    assert len(result["code"]) == 600

    full = read_threeui_source.func(
        effect_id="crt", file_path="src/shaders/crt/crtShaders.ts", max_chars=14000
    )
    assert full["truncated"] is False
    assert "precision highp float" in full["code"]


def test_read_source_hard_caps_the_requested_size():
    result = read_threeui_source.func(
        effect_id="liquid-metal-button",
        file_path="src/shaders/liquid-metal-button/liquid-metal-button.html",
        max_chars=10_000_000,
    )
    assert len(result["code"]) <= ref.MAX_SOURCE_CHARS


def test_read_source_rejects_unknown_paths():
    result = read_threeui_source.func(effect_id="crt", file_path="nope.ts")
    assert "error" in result
    assert "src/shaders/crt/crtShaders.ts" in result["available_files"]


def test_csp_audit_flags_dependencies_the_sandbox_would_block():
    """Shipping a reference that quietly needs a blocked CDN would teach the
    model a pattern that fails at render time."""
    panel = read_threeui_effect.func(effect_id="diagnostics-panel")
    assert panel["csp"]["compatible_with_sandbox"] is False
    assert "cdn.tailwindcss.com" in panel["csp"]["blocked_hosts"]
    assert panel["csp"]["external_stylesheet_link"] is True

    crt = read_threeui_effect.func(effect_id="crt")
    assert crt["csp"]["compatible_with_sandbox"] is True
    assert crt["csp"]["blocked_hosts"] == []


def test_catalogue_is_mit_and_marks_its_source():
    catalog = ref._catalog()
    assert catalog["license"].startswith("MIT")
    assert "MengTo/threeui" in catalog["source"]


def test_threeui_tools_are_wired_into_the_agent():
    """Being present in a list is not the same as being bound to the model.

    Spy on create_deep_agent and assert the real tools= kwarg, so a future
    refactor that builds the list but forgets to splat it into the agent fails
    here instead of silently shipping a prompt that documents tools the model
    cannot call.
    """
    import importlib
    import sys

    import deepagents

    original = deepagents.create_deep_agent
    captured = {}

    def spy(*args, **kwargs):
        captured.update(kwargs)
        return original(*args, **kwargs)

    sys.modules.pop("main", None)
    deepagents.create_deep_agent = spy
    try:
        importlib.import_module("main")
    finally:
        deepagents.create_deep_agent = original
        sys.modules.pop("main", None)

    names = {getattr(t, "name", None) for t in captured.get("tools", [])}
    assert {"browse_threeui_effects", "read_threeui_effect", "read_threeui_source"} <= names
    # The prompt the agent actually receives must carry the index section.
    assert "3D / WebGL Reference Library" in (captured.get("system_prompt") or "")
