from langchain.tools import ToolRuntime, tool
from langchain.messages import ToolMessage
from langgraph.types import Command
from typing import Any, Literal, Optional, TypedDict
import uuid
import json
from pathlib import Path
from src.shadcn_reference import chart_references
from datetime import datetime


class UITemplate(TypedDict, total=False):
    id: str
    name: str
    description: str
    html: str
    data_description: str
    created_at: str
    version: int
    kind: Literal["page", "component"]
    component_type: Optional[str]
    component_data: Optional[dict[str, Any]]
    source: str
    source_url: str
    reference_order: int
    asset_paths: list[str]
    preview_width: int
    preview_height: int


# Built-in seed templates — must stay in sync with apps/app/src/components/template-library/seed-templates.ts
# Only id, name, description, html, and data_description are needed for apply_template lookups.
SEED_TEMPLATES: list[UITemplate] = [
    {
        "id": "seed-weather-001",
        "kind": "component",
        "name": "天气卡片",
        "description": "展示温度、湿度、风力等级和空气质量的当前天气卡片",
        "html": "",  # Populated at module load from _SEED_HTML below
        "data_description": "城市、日期、气温、天气状况、湿度、风向/风力等级、空气质量（等级与 PM2.5）、未来 5 天预报",
        "version": 1,
    },
    {
        "id": "seed-invoice-001",
        "kind": "component",
        "name": "发票卡片",
        "description": "含金额、客户信息与操作按钮的紧凑发票卡",
        "html": "",
        "data_description": "标题、金额、说明、客户名、账期、发票编号、到期日",
        "version": 1,
    },
    {
        "id": "seed-dashboard-001",
        "kind": "page",
        "name": "业绩仪表盘",
        "description": "完整经营分析页面，包含页头、KPI 指标区、月度图表和页脚",
        "html": "",
        "data_description": "标题、副标题、KPI 标签/数值/变化、月度柱状图数据、图例项",
        "version": 1,
    },
]

# Load seed HTML from the frontend source so there's a single source of truth.
SEED_TEMPLATES.extend(chart_references())
# Keep the dashboard catalog packaged with the agent as well as the frontend,
# so ID-only selections work in standalone deployments.
_dashboard_file = Path(__file__).resolve().parent / "data" / "dashboard-templates.json"
if _dashboard_file.is_file():
    SEED_TEMPLATES[0:0] = json.loads(_dashboard_file.read_text(encoding="utf-8"))
# If the file isn't available (e.g. in a standalone agent deploy), seeds will
# still be discoverable by name but with empty HTML — the agent can regenerate.
def _load_seed_html() -> None:
    from pathlib import Path

    seed_file = Path(__file__).resolve().parents[2] / "app" / "src" / "components" / "template-library" / "seed-templates.ts"
    if not seed_file.exists():
        return
    text = seed_file.read_text(encoding="utf-8")
    # Map TS variable names to seed IDs
    mapping = {
        "weatherHtml": "seed-weather-001",
        "invoiceHtml": "seed-invoice-001",
        "dashboardHtml": "seed-dashboard-001",
    }
    for var_name, seed_id in mapping.items():
        # Extract template literal content between first ` and last `
        marker = f"const {var_name} = `"
        start = text.find(marker)
        if start == -1:
            continue
        start += len(marker)
        end = text.find("`;", start)
        if end == -1:
            continue
        html = text[start:end]
        for seed in SEED_TEMPLATES:
            if seed["id"] == seed_id:
                seed["html"] = html
                break

_load_seed_html()


# Appended to every apply_template payload: template HTML is a style
# reference saved as a single string, so it may bundle idioms that the
# canonical generateSandboxedUi contract splits across parameters.
TEMPLATE_USAGE_NOTE = (
    "This template HTML may represent a full page, component or style reference. "
    "Selecting it alone is not an instruction to create a new page. "
    "Follow the user's latest request in the current conversation: preserve unrelated "
    "structure for local edits; apply the full page when explicitly requested. "
    "Preserve live data bindings and refresh behavior unless changes are requested. "
    "Never substitute template sample values for business data. When regenerating via "
    "generateSandboxedUi: move any <style> block content into the css parameter "
    "(the html parameter must not contain <style> blocks); put behavior in "
    "jsFunctions/jsExpressions; and send prompts through the sandbox bridge — "
    "await Websandbox.connection.remote.sendPrompt({ text }) — never a bare "
    "sendPrompt(...) call."
)


def reference_kind(item: dict) -> Literal["page", "component"]:
    """Match the frontend's compatibility rules for older saved references."""
    if item.get("kind") in ("page", "component"):
        return item["kind"]
    if item.get("component_type") or item.get("id") in ("seed-weather-001", "seed-invoice-001"):
        return "component"
    return "page"


def reference_payload(item: dict) -> dict:
    kind = reference_kind(item)
    scope_note = (
        "Page template: use as a whole-page layout and style reference, following the user's request. "
        if kind == "page" else
        "Component reference: apply only to the requested local component; preserve the rest of the page. "
    )
    return {
        "name": item["name"],
        "description": item["description"],
        "html": item.get("html", ""),
        "data_description": item.get("data_description", ""),
        "kind": kind,
        **({"rendering_note": (
            "Keep all KPI values and their units fully readable. Never truncate numeric values "
            "or units with ellipses. Use responsive font sizes, move units onto another line, "
            "or reduce the number of columns when space is limited. Keep local illustrations "
            "within their panel and preserve the reference's distinct palette and chart types."
        )} if item.get("reference_order") else {}),
        **({"asset_paths": item["asset_paths"], "asset_note": (
            "The /template-assets/*.svg paths are existing local reference assets served by the app. "
            "MUST reuse these exact image URLs in the generated HTML (img src), preserving their "
            "aspect ratio with object-fit:contain. Do not redraw, simplify, or replace the province "
            "boundaries, city scene or factory illustration. These assets keep the output compact. "
            "Adapt the surrounding editable charts and business data to the user request."
        )} if item.get("asset_paths") else {}),
        **({"component_type": item["component_type"], "component_data": item.get("component_data", {})} if item.get("component_type") else {}),
        **({"reference_source": item["source"], "source_url": item["source_url"],
            "reference_note": "React/Recharts source is reference only. Translate to sandbox HTML/CSS/JS; never paste JSX. Replace sample data."} if item.get("source") else {}),
        "usage_note": scope_note + TEMPLATE_USAGE_NOTE,
    }


def merged_references(state: dict) -> list[dict]:
    seeds = {item["id"]: item for item in SEED_TEMPLATES}
    saved = state.get("templates", [])
    # Old client/checkpoint records may omit chart source. Hydrate built-ins
    # before returning them, while keeping saved reference fields intact.
    hydrated = [{**seeds.get(item["id"], {}), **item} for item in saved]
    saved_ids = {item["id"] for item in saved}
    return [*hydrated, *(item for item in SEED_TEMPLATES if item["id"] not in saved_ids)]


@tool
def save_template(
    name: str,
    description: str,
    html: str,
    data_description: str,
    runtime: ToolRuntime,
    kind: Literal["page", "component"],
) -> Command:
    """
    Save a reusable reference into the page template library or component library.
    Use kind='page' for complete pages and kind='component' for small widgets/cards/charts.
    Ask the user which library if the desired scope is unclear.

    Args:
        name: Short name for the template (e.g. "Invoice", "Dashboard")
        description: What the template displays or does
        html: The raw HTML string of the widget to save as a template
        data_description: Description of the data shape this template expects
        kind: 'page' for the template library, 'component' for the component library
    """
    templates = list(runtime.state.get("templates", []))

    template: UITemplate = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "html": html,
        "data_description": data_description,
        "created_at": datetime.now().isoformat(),
        "version": 1,
        "kind": kind,
    }
    templates.append(template)

    return Command(update={
        "templates": templates,
        "messages": [
            ToolMessage(
                content=f"Template '{name}' saved successfully (id: {template['id']})",
                tool_call_id=runtime.tool_call_id,
            )
        ],
    })


@tool
def list_templates(runtime: ToolRuntime, kind: Optional[Literal["page", "component"]] = None):
    """
    List references including built-ins. Filter kind='page' for the template library
    or kind='component' for the component library; omit kind to list both.
    Returns summaries including each reference's kind.
    """
    templates = merged_references(runtime.state)
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "data_description": t["data_description"],
            "version": t["version"],
            "kind": reference_kind(t),
        }
        for t in templates
        if kind is None or reference_kind(t) == kind
    ]


@tool
def apply_template(runtime: ToolRuntime, name: str = "", template_id: str = ""):
    """
    Retrieve a saved template's HTML as a full page, component or style reference
    for the user's latest request in the current conversation. Follow the requested
    scope: local edits preserve unrelated content; full-page redesign or replacement
    is allowed when explicitly requested. Preserve data bindings and refresh behavior
    unless changes are requested. For sandbox page edits, emit the revised source via
    generateSandboxedUi. Do not create a new standalone widget by default.

    This tool automatically checks for a pending_template in state (set by the
    frontend when the user picks a template from the library). If pending_template
    is present, it takes priority over name/template_id arguments.

    Also searches built-in seed templates, so users can apply them by name in chat
    even if the frontend hasn't pushed them into agent state yet.

    Args:
        name: The name of the template to apply (fallback if no pending_template)
        template_id: The ID of the template to apply (fallback if no pending_template)
    """
    # A design asset id looks like a template id to a caller in a hurry. Steer
    # it to the tool that can actually read a saved page instead of dead-ending
    # on "not found".
    pending_asset = runtime.state.get("pending_design_asset")
    if pending_asset and template_id and template_id == pending_asset.get("id"):
        return {
            "error": (
                f"'{template_id}' is a saved design asset being redesigned, not a "
                "template. Call read_design_asset instead — it returns that page's "
                "css / html / jsFunctions / jsExpressions."
            )
        }

    templates = merged_references(runtime.state)

    # Check pending_template from frontend first — this is the most reliable source
    pending = runtime.state.get("pending_template")
    if pending and pending.get("id"):
        template_id = pending["id"]

    # Look up by ID first
    if template_id:
        for t in templates:
            if t["id"] == template_id:
                return reference_payload(t)
        return {"error": f"Template with id '{template_id}' not found"}

    # Look up by name (most recent match)
    if name:
        matches = [t for t in templates if t["name"].lower() == name.lower()]
        if matches:
            t = max(matches, key=lambda x: x.get("created_at", ""))
            return reference_payload(t)
        return {"error": f"No template named '{name}' found"}

    return {"error": "Provide either a name or template_id"}


@tool
def delete_template(template_id: str, runtime: ToolRuntime) -> Command:
    """
    Delete a saved UI template.

    Args:
        template_id: The ID of the template to delete
    """
    templates = list(runtime.state.get("templates", []))
    original_len = len(templates)
    templates = [t for t in templates if t["id"] != template_id]

    if len(templates) == original_len:
        return Command(update={
            "messages": [
                ToolMessage(
                    content=f"Template with id '{template_id}' not found",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        })

    return Command(update={
        "templates": templates,
        "messages": [
            ToolMessage(
                content=f"Template deleted successfully",
                tool_call_id=runtime.tool_call_id,
            )
        ],
    })


@tool
def clear_pending_template(runtime: ToolRuntime) -> Command:
    """
    Clear the pending_template from state after applying it.
    Call this after you have finished applying a template.
    """
    return Command(update={
        "pending_template": None,
        "messages": [
            ToolMessage(
                content="Pending template cleared",
                tool_call_id=runtime.tool_call_id,
            )
        ],
    })


template_tools = [
    save_template,
    list_templates,
    apply_template,
    delete_template,
    clear_pending_template,
]
