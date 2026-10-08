"""
This is the main entry point for the agent.
It defines the workflow graph, state, tools, nodes and edges.
"""

import os
import warnings

from dotenv import load_dotenv
from fastapi import FastAPI
from copilotkit import CopilotKitMiddleware
from src.generation_agent import GenerationAGUIAgent
from src.generation_output import CompleteUIOutputMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from deepagents import create_deep_agent

from src.anthropic_compat import ConsecutiveSystemMessagesMiddleware
from src.bounded_memory_saver import BoundedMemorySaver
from src.model import build_model
from src.query import query_data
from src.todos import todo_tools
from src.form import generate_form
from src.plan import plan_visualization
from src.templates import template_tools
from src.design_assets import design_asset_tools
from src.threeui_reference import threeui_tools
from src.shadcn_reference import shadcn_tools
from src.prompt import SYSTEM_PROMPT
from src.selected_reference import SelectedReferenceMiddleware
from src.skills_backend import SKILLS_SOURCE, create_agent_backend

load_dotenv()

agent = create_deep_agent(
    model=build_model(),
    tools=[
        query_data,
        plan_visualization,
        *todo_tools,
        generate_form,
        *template_tools,
        *design_asset_tools,
        *threeui_tools,
        *shadcn_tools,
    ],
    middleware=[CopilotKitMiddleware(), SelectedReferenceMiddleware(), ConsecutiveSystemMessagesMiddleware(), CompleteUIOutputMiddleware()],
    backend=create_agent_backend,
    skills=[SKILLS_SOURCE],
    checkpointer=BoundedMemorySaver(max_threads=200),
    system_prompt=SYSTEM_PROMPT,
)

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


add_langgraph_fastapi_endpoint(
    app=app,
    agent=GenerationAGUIAgent(
        name="sample_agent",
        description="CopilotKit + LangGraph demo agent",
        graph=agent,
    ),
    path="/",
)

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8123"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
