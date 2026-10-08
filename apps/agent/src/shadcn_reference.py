"""Source-owned shadcn/ui reference layer for component generation.

The installed React components are useful design and interaction references, but
they are not pasted directly into the OpenGenerativeUI iframe because that
iframe has no React runtime. The agent reads only the component it needs and
translates the visual pattern to the sandbox's HTML/CSS/JS contract.
"""

from __future__ import annotations

import re
import json
from pathlib import Path

from langchain.tools import tool

UI_DIR = Path(__file__).resolve().parents[2] / "app" / "src" / "components" / "ui"
MAX_SOURCE_CHARS = 14000
CHART_CATALOG = UI_DIR.parents[1] / "data" / "shadcn-charts.json"

def chart_references() -> list[dict]:
    return json.loads(CHART_CATALOG.read_text(encoding="utf-8")) if CHART_CATALOG.is_file() else []

DOC_ONLY_COMPONENTS = {
    "data-table": "官方提供的是 Table + TanStack Table 的构建指南，不是单一可安装组件。",
    "date-picker": "官方提供的是 Calendar、Popover 等组件组合示例，不是单一可安装组件。",
    "typography": "官方 Typeset 页面，主要提供排版示例和设计规范，不是单一可安装组件。",
}

DISPLAY_NAMES = {
    name: name.replace("-", " ").title()
    for name in (
        "accordion alert alert-dialog aspect-ratio attachment avatar badge breadcrumb bubble "
        "button button-group calendar card carousel chart checkbox collapsible combobox command "
        "context-menu dialog direction drawer dropdown-menu empty field hover-card input input-group "
        "input-otp item kbd label marker menubar message message-scroller native-select navigation-menu "
        "pagination popover progress questionnaire radio-group resizable scroll-area select separator "
        "sheet sidebar skeleton slider spinner switch table tabs textarea sonner toggle toggle-group "
        "tooltip"
    ).split()
}


def _matches(name: str, query: str) -> bool:
    needle = query.lower()
    return not needle or needle in name.lower() or needle in DISPLAY_NAMES.get(name, "").lower()


@tool
def list_shadcn_components(query: str = "") -> dict:
    """List the installed shadcn/ui component references.

    Call this before choosing a shadcn pattern. Use read_shadcn_component for
    the source of one or two relevant components, then translate the React /
    Tailwind implementation into plain sandbox HTML/CSS/JS.

    Args:
        query: Optional name filter such as "dialog", "form", or "table".
    """
    installed = {p.stem for p in UI_DIR.glob("*.tsx")} if UI_DIR.is_dir() else set()
    charts = {item["id"].removeprefix("seed-shadcn-"): item for item in chart_references()}
    installed.update(charts)
    names = sorted(set(installed) | set(DOC_ONLY_COMPONENTS))
    selected = [name for name in names if _matches(name, query) or (name in charts and query in charts[name]["name"])]
    return {
        "reference_source": "shadcn/ui installed source under apps/app/src/components/ui",
        "installed_count": len(installed),
        "matched": len(selected),
        "components": [
            {
                "name": name,
                "title": charts[name]["name"] if name in charts else DISPLAY_NAMES.get(name, name.replace("-", " ").title()),
                "installed": name in installed,
                "note": DOC_ONLY_COMPONENTS.get(name, ""),
            }
            for name in selected
        ],
        "usage_note": (
            "参考源码是 React/Tailwind 实现，不要原样粘贴到 generateSandboxedUi。"
            "沙箱没有 React；请提取布局、层级、交互和视觉语言，改写为 css/html/jsFunctions/jsExpressions。"
        ),
    }


@tool
def read_shadcn_component(name: str, max_chars: int = 12000) -> dict:
    """Read one installed shadcn/ui component source, bounded by size.

    Args:
        name: Component name returned by list_shadcn_components, e.g. "dialog".
        max_chars: Maximum source characters to return, capped at 14000.
    """
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name or ""):
        return {"error": "Invalid component name", "hint": "Use list_shadcn_components first."}

    path = UI_DIR / f"{name}.tsx"
    chart = next((item for item in chart_references() if item["id"] == f"seed-shadcn-{name}"), None)
    if chart:
        cap = max(500, min(int(max_chars or 12000), MAX_SOURCE_CHARS))
        return {"name": name, "source_url": chart["source_url"], "source": chart["source"][:cap],
                "truncated": len(chart["source"]) > cap,
                "usage_note": "官方 React/Recharts 示例；沙箱没有 React，请转换为 HTML/CSS/JS 或 SVG，保留坐标轴、图例、悬停提示及交互，替换样例数据。"}
    if not path.is_file():
        if name in DOC_ONLY_COMPONENTS:
            return {
                "name": name,
                "installed": False,
                "note": DOC_ONLY_COMPONENTS[name],
                "hint": "Use the installed primitives listed by list_shadcn_components to build this pattern.",
            }
        return {"error": f"No installed shadcn component named '{name}'"}

    cap = max(500, min(int(max_chars or 12000), MAX_SOURCE_CHARS))
    source = path.read_text(encoding="utf-8")
    return {
        "name": name,
        "title": DISPLAY_NAMES.get(name, name.replace("-", " ").title()),
        "path": str(path),
        "bytes": len(source),
        "truncated": len(source) > cap,
        "source": source[:cap],
        "usage_note": (
            "这是 React/Tailwind 参考源码，不是沙箱成品。不要复制 import 或 JSX；"
            "只提取结构、状态、交互和视觉规则，并改写为 generateSandboxedUi 的 plain HTML/CSS/JS。"
        ),
    }


shadcn_tools = [list_shadcn_components, read_shadcn_component]
