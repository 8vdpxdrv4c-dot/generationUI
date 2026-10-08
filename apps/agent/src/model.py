"""Chat model factory for the agent."""

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models.chat_models import BaseChatModel

DEFAULT_MODEL = "claude-fable-5"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# langchain-anthropic defaults max_tokens to 4096, which truncates
# generateSandboxedUi tool args mid-stream (jsFunctions/jsExpressions never
# arrive and the widget is stuck in its preview sandbox). Widget generation
# routinely needs tens of thousands of output tokens.
MAX_TOKENS = 64000


def build_model() -> BaseChatModel:
    model_name = os.environ.get("LLM_MODEL", DEFAULT_MODEL)
    if model_name.startswith("gpt-"):
        # Production fallback: gpt-* names route to OpenAI so LLM_MODEL can be
        # flipped in the deploy dashboard without a code change. No max_tokens
        # override here — OpenAI's default matches pre-migration behavior.
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model_name)
    if model_name.startswith("deepseek-"):
        # DeepSeek is OpenAI-compatible; use DEEPSEEK_API_KEY or OPENAI_API_KEY.
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_name,
            api_key=os.environ.get("DEEPSEEK_API_KEY")
            or os.environ.get("OPENAI_API_KEY"),
            base_url=os.environ.get("DEEPSEEK_BASE_URL", DEEPSEEK_BASE_URL),
            max_tokens=MAX_TOKENS,
        )
    return ChatAnthropic(
        model=model_name,
        max_tokens=MAX_TOKENS,
    )
