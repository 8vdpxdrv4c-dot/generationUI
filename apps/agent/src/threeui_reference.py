"""ThreeUI Community reference layer.

ThreeUI (https://threeui.com, MIT, github.com/MengTo/threeui) is a React +
Three.js catalogue of shader-driven UI. It is only ever used here as *reference
material*: nothing from it is copied into the sandbox at runtime, and the
sandbox has no React anyway. The value is that its renderers and GLSL teach
transferable technique for a generator that emits plain HTML/CSS/JS.

Deliberately two-tier:

  * the system prompt carries only a tiny index (see prompt.py) - never the
    records;
  * records are fetched on demand through these tools.

That split is not stylistic. BoundedMemorySaver re-sends every message on every
turn of a thread, so anything placed in the prompt is paid for again on each
subsequent turn. A 40 KB reference dump would recreate the exact pathology the
design-asset work removed.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from langchain.tools import tool

DATA_DIR = Path(__file__).resolve().parent / "data" / "threeui"
CATALOG_PATH = DATA_DIR / "catalog.json"
EFFECTS_DIR = DATA_DIR / "effects"

# Budgets. Tool results accumulate in the thread too, so both caps matter.
# Sized so one *complete* shader or renderer file fits (crtShaders.ts is 3.8 KB,
# energyOrbShaders.ts 4.8 KB) - a complete file is worth more than two partial
# ones - while a second file only rides along if there is room left.
KEY_CODE_BUDGET = 5500
PER_FILE_CAP = 5500
MAX_SOURCE_CHARS = 14000

CATEGORY_LABELS = {
    "background": "背景 / 着色器场（可铺底的视觉）",
    "visual": "视觉特效（独立画面元素）",
    "scene": "3D 场景（有实体几何与空间）",
    "data": "数据可视化（曲线 / 面板 / 图表 / 流）",
    "ui": "界面控件（按钮 / 开关 / 加载 / 徽标）",
    "page": "整页模板（完整 HTML 文档）",
}

REFERENCE_USAGE_NOTE = (
    "这是**参考**，不是可直接粘贴的成品。落成 generateSandboxedUi 时必须："
    "① 只抄 shader / renderer / 结构，不要抄 React 包装层（沙箱里没有 React）；"
    "② 把 `three128` / `three165` 这类别名改成沙箱 importmap 提供的 `three`；"
    "③ 参考里的 <style> 内容要拆进 css 参数 —— html 参数不允许含 <style>；"
    "④ 参考里的行为要改写进 jsFunctions（动态 import 只能出现在异步函数体内），"
    "jsExpressions 只放同步调用语句；"
    "⑤ 如果 csp.compatible 为 false，必须先按 transfer 的说明替换被 CSP 拦截的外部依赖，"
    "否则在沙箱里必然白屏或丢样式。"
)


def _load_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _catalog() -> dict:
    if not CATALOG_PATH.is_file():
        return {"components": []}
    return _load_json(CATALOG_PATH)


@lru_cache(maxsize=16)
def _effect(effect_id: str) -> dict | None:
    path = EFFECTS_DIR / f"{effect_id}.json"
    if not path.is_file():
        return None
    return _load_json(path)


def _matches(component: dict, needle: str) -> bool:
    hay = " ".join(
        [component.get("id", ""), component.get("exportName", ""),
         component.get("runtime", "")]
    ).lower()
    return needle in hay


@tool
def browse_threeui_effects(category: str = "", query: str = "") -> dict:
    """List ThreeUI reference effects available for 3D / WebGL / motion work.

    Call this before building anything 3D, shader-driven, or heavily animated,
    to see whether a relevant reference implementation exists. Returns a compact
    index only - use read_threeui_effect(effect_id) to pull one entry.

    Args:
        category: optional filter. One of: background, visual, scene, data, ui, page.
        query: optional free-text filter matched against id / component name / runtime.
    """
    components = _catalog().get("components", [])
    if not components:
        return {
            "error": "ThreeUI reference data is not installed. Run "
                     "tools/threeui-reference/fetch.py then build.py to regenerate it."
        }

    selected = components
    if category:
        selected = [c for c in selected if c.get("category") == category.lower()]
    if query:
        selected = [c for c in selected if _matches(c, query.lower())]

    counts: dict[str, int] = {}
    for c in components:
        counts[c.get("category", "?")] = counts.get(c.get("category", "?"), 0) + 1

    return {
        "reference_source": "ThreeUI Community (MIT) - reference only, never copied into the sandbox",
        "categories": {k: {"count": v, "means": CATEGORY_LABELS.get(k, "")} for k, v in sorted(counts.items())},
        "matched": len(selected),
        "effects": [
            {
                "id": c["id"],
                "component": c.get("exportName", ""),
                "category": c.get("category", ""),
                "runtime": c.get("runtime", ""),
                "has_full_record": bool(c.get("inBatch")),
            }
            for c in sorted(selected, key=lambda c: (c.get("category", ""), c["id"]))
        ],
        "usage_note": REFERENCE_USAGE_NOTE,
    }


def _key_code(record: dict) -> tuple[list[dict], list[str]]:
    """Embed the transferable files, skip React wrappers, stay inside budget."""
    # Shaders carry the most transferable knowledge, then renderers, then whole
    # documents (which tend to be large and get truncated).
    order = {"shader": 0, "renderer": 1, "document": 2, "code": 3, "style": 4}
    candidates = [f for f in record.get("files", []) if f.get("code") and not f.get("skipped")]
    candidates.sort(key=lambda f: (order.get(f.get("kind", "code"), 9), -f.get("bytes", 0)))

    embedded: list[dict] = []
    skipped: list[str] = []
    spent = 0
    for f in candidates:
        if f.get("react"):
            skipped.append(f["path"])
            continue
        if spent >= KEY_CODE_BUDGET:
            skipped.append(f["path"])
            continue
        room = min(PER_FILE_CAP, KEY_CODE_BUDGET - spent)
        code = f["code"]
        truncated = len(code) > room
        embedded.append({
            "path": f["path"],
            "kind": f.get("kind", ""),
            "bytes": f.get("bytes", len(code)),
            "truncated": truncated,
            "code": code[:room],
        })
        spent += len(code[:room])
    return embedded, skipped


@tool
def read_threeui_effect(effect_id: str) -> dict:
    """Read one ThreeUI reference effect: what it does, how it is implemented,
    which knobs it exposes, and its key source.

    Use the returned `technique` and `key_code` as inspiration and as a
    correctness reference while you write the sandbox implementation. Do not
    paste it verbatim - see usage_note. Call browse_threeui_effects first if you
    do not know the id.

    Args:
        effect_id: an id from browse_threeui_effects, e.g. "crt", "structure-flow".
    """
    record = _effect(effect_id)
    if record is None:
        available = [c["id"] for c in _catalog().get("components", []) if c.get("inBatch")]
        return {
            "error": f"No full reference record for '{effect_id}'.",
            "full_records_available": available,
            "hint": "browse_threeui_effects lists every id; only the ones above carry deep records.",
        }

    embedded, skipped = _key_code(record)
    csp = record.get("csp", {})
    payload = {
        "id": record["id"],
        "component": record.get("exportName", ""),
        "runtime": record.get("runtime", ""),
        "license": record.get("license", "MIT"),
        "summary": record.get("summary", ""),
        "technique": record.get("technique", ""),
        "transfer_notes": record.get("transfer", ""),
        "options": record.get("options", {}),
        "csp": {
            "compatible_with_sandbox": csp.get("compatible", True),
            "blocked_hosts": csp.get("blockedHosts", []),
            "external_stylesheet_link": csp.get("externalStylesheetLink", False),
        },
        "key_code": embedded,
        "not_embedded": skipped,
        "usage_note": REFERENCE_USAGE_NOTE,
    }
    if skipped:
        payload["more"] = (
            "Use read_threeui_source(effect_id, file_path) to pull any file listed "
            "in not_embedded, with an explicit size cap."
        )
    return payload


@tool
def read_threeui_source(effect_id: str, file_path: str, max_chars: int = 6000) -> dict:
    """Read one specific source file from a ThreeUI reference effect, size-capped.

    Only needed when key_code was truncated or a file was listed under
    not_embedded and you actually need it. Prefer the smaller, already-embedded
    files - every character returned stays in the conversation for the rest of
    the thread.

    Args:
        effect_id: an id from browse_threeui_effects.
        file_path: exact path as listed in the record (e.g. "src/shaders/crt/crtShaders.ts").
        max_chars: upper bound on returned characters (default 6000, hard max 14000).
    """
    record = _effect(effect_id)
    if record is None:
        return {"error": f"No full reference record for '{effect_id}'."}

    cap = max(500, min(int(max_chars or 6000), MAX_SOURCE_CHARS))
    for f in record.get("files", []):
        if f["path"] == file_path:
            code = f.get("code", "")
            if not code:
                return {
                    "error": f"'{file_path}' exists but was too large to embed in the dataset.",
                    "bytes": f.get("bytes", 0),
                    "hint": "read this file straight from the ThreeUI package instead "
                            "(tools/threeui-reference/.cache/pkg/package/lib-dist/...).",
                }
            return {
                "id": effect_id,
                "path": file_path,
                "kind": f.get("kind", ""),
                "bytes": f.get("bytes", len(code)),
                "truncated": len(code) > cap,
                "code": code[:cap],
            }

    return {
        "error": f"'{file_path}' is not part of effect '{effect_id}'.",
        "available_files": [f["path"] for f in record.get("files", [])],
    }


threeui_tools = [browse_threeui_effects, read_threeui_effect, read_threeui_source]
