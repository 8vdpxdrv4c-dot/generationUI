from langchain.agents import AgentState as BaseAgentState
from langchain.tools import ToolRuntime, tool
from langchain.messages import ToolMessage
from langgraph.types import Command
from typing import Any, NotRequired, Optional, TypedDict, Literal
import uuid

class Todo(TypedDict):
    id: str
    title: str
    description: str
    emoji: str
    status: Literal["pending", "completed"]


class PendingTemplate(TypedDict):
    id: str
    name: str
    kind: NotRequired[Literal["page", "component"]]


class UITemplateState(TypedDict, total=False):
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
    family: str


class PendingDesignAsset(TypedDict, total=False):
    """A saved page queued for redesign, pushed in by the history sidebar.

    Carries the page's separated source rather than a pasted document, so the
    conversation stays small and the agent gets the baseline in the same shape
    generateSandboxedUi produces.
    """

    id: str
    title: str
    version: int
    requirement: str
    format: str
    css: str
    html: str
    jsFunctions: str
    jsExpressions: list[str]
    componentType: str


class AgentState(BaseAgentState):
    todos: list[Todo]
    templates: NotRequired[list[UITemplateState]]
    pending_template: NotRequired[Optional[PendingTemplate]]
    pending_design_asset: NotRequired[Optional[PendingDesignAsset]]
    current_generated_ui: NotRequired[Optional[dict[str, Any]]]

@tool
def manage_todos(todos: list[Todo], runtime: ToolRuntime) -> Command:
    """
    Manage the current todos.
    """
    # Ensure all todos have IDs that are unique
    for todo in todos:
        if "id" not in todo or not todo["id"]:
            todo["id"] = str(uuid.uuid4())

    # Update the state
    return Command(update={
        "todos": todos,
        "messages": [
            ToolMessage(
                content="Successfully updated todos",
                tool_call_id=runtime.tool_call_id
            )
        ],
    })

@tool
def get_todos(runtime: ToolRuntime):
    """
    Get the current todos.
    """
    return runtime.state.get("todos", [])

todo_tools = [
    manage_todos,
    get_todos,
]
