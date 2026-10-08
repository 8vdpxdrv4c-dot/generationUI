"""
Design-asset tools — read the baseline page for a redesign.

Two ways in, in order of preference:

1. `pending_design_asset` in graph state. The frontend pushes it when a redesign
   starts from the history sidebar. Fast, but it depends on client state having
   been synced for the current run.
2. The app's own HTTP API: `GET {APP_BASE_URL}/api/history/<id>?version=N`.
   This is the dependable path — it works on a fresh thread, after an agent
   reload, or when state never made it across, and it is also what makes the
   saved library readable to the agent at all.

Either way the page source arrives as a *tool result*, never as conversation
text. That is the point: every message in a thread is re-sent on every turn, so
a pasted ~12k-token baseline would be paid for again on each subsequent turn and
would accumulate once per redesign. It also means nothing has to be truncated to
fit a prompt limit, and the agent receives the source in the same
css / html / jsFunctions / jsExpressions shape generateSandboxedUi expects,
rather than having to reverse-engineer an assembled document.
"""

import json
import os
import urllib.error
import urllib.request

from langchain.tools import ToolRuntime, tool
from langchain.messages import ToolMessage
from langgraph.types import Command

# Appended to every baseline payload.
DESIGN_BASELINE_NOTE = (
    "This is the page's source in the same shape generateSandboxedUi takes. "
    "Revise it in place and emit the whole page again, splitting it back the "
    "same way: all styles in the css parameter, the html parameter WITHOUT any "
    "<style> block, and behaviour in jsFunctions / jsExpressions. Keep the "
    "existing structure, layout classes and design-system variables; change "
    "only what the new request asks for."
)


def _app_base_url() -> str:
    return os.getenv("APP_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def _get_json(path: str):
    """Fetch JSON from the app, bypassing any ambient proxy.

    A dev machine may export HTTP_PROXY; without this the request to localhost
    would be tunnelled and fail.
    """
    url = f"{_app_base_url()}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _load_from_app(asset_id: str, version: int) -> dict:
    try:
        meta = (_get_json(f"/api/history/{asset_id}") or {}).get("item") or {}
        wanted = version or meta.get("currentVersion") or 1
        detail = _get_json(f"/api/history/{asset_id}?version={wanted}") or {}
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {"error": f"No saved design with id '{asset_id}'."}
        return {"error": f"Reading design '{asset_id}' failed: HTTP {error.code}"}

    entry = detail.get("version") or {}
    source = entry.get("source") or {}
    if not source:
        return {
            "error": (
                f"Design asset '{asset_id}' exists but version {wanted} carried "
                "no page source."
            )
        }

    common = {
        "asset_id": asset_id,
        "title": meta.get("title", ""),
        "version": entry.get("version", wanted),
        "requirement": entry.get("requirement", ""),
    }

    if source.get("format") == "standalone":
        return {
            **common,
            "format": "standalone",
            "html": source.get("html", ""),
            "usage_note": (
                "This page was stored as one opaque document rather than "
                "separated source, so reproduce the requested changes as a fresh "
                "generateSandboxedUi page that matches its look and behaviour."
            ),
        }

    return {
        **common,
        "format": "sandboxed-ui",
        "css": source.get("css", ""),
        "html": source.get("html", ""),
        "jsFunctions": source.get("jsFunctions", ""),
        "jsExpressions": source.get("jsExpressions", []),
        "usage_note": DESIGN_BASELINE_NOTE,
    }


@tool
def read_design_asset(runtime: ToolRuntime, asset_id: str = "", version: int = 0):
    """
    Read a saved page's source so you can redesign it: its css, html,
    jsFunctions and jsExpressions, plus its title, version number and the
    request that produced that version.

    Call this FIRST whenever the user asks to redesign a saved page. This is the
    ONLY tool that can read a saved page — a design asset is not a template, so
    apply_template / list_templates will report "not found" for its id. Never
    ask the user to paste the page: read it here.

    Args:
        asset_id: The saved page's id, given in the request. Leave empty to use
            the pending_design_asset already in state.
        version: Version to read. Leave 0 for the current version; pass a
            specific number to branch off an older one.
    """
    pending = runtime.state.get("pending_design_asset")
    if pending and not asset_id:
        if not version or version == pending.get("version"):
            return {**pending, "usage_note": DESIGN_BASELINE_NOTE}

    target = asset_id or (pending or {}).get("id", "")
    if not target:
        return {
            "error": (
                "No design asset to read: state carries no pending_design_asset "
                "and no asset_id was given. Ask the user which saved page they "
                "mean."
            )
        }

    try:
        return _load_from_app(target, version)
    except Exception as error:  # noqa: BLE001
        return {
            "error": (
                f"Could not reach the app at {_app_base_url()} to read design "
                f"'{target}' ({error}). Set APP_BASE_URL to the app's origin."
            )
        }


@tool
def clear_pending_design_asset(runtime: ToolRuntime) -> Command:
    """
    Clear pending_design_asset from state once the redesign has been rendered.
    Call this after generateSandboxedUi has produced the revised page.
    """
    return Command(
        update={
            "pending_design_asset": None,
            "messages": [
                ToolMessage(
                    content="Pending design asset cleared",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


design_asset_tools = [
    read_design_asset,
    clear_pending_design_asset,
]
