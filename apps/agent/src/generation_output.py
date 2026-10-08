"""Validate a complete UI tool call before delivering executable source."""
import json
import logging
import re
import shutil
import subprocess

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

logger = logging.getLogger(__name__)
UI_TOOL = "generateSandboxedUi"
MAX_UI_BYTES = 256_000
NODE_EXECUTABLE = shutil.which("node")
COMPACT_UI_INSTRUCTION = """生成页面必须优先保证完整和可运行：一次 generateSandboxedUi 的
CSS、HTML、JS 合计尽量控制在 12000 个字符以内，减少装饰、重复说明和不必要的几何细节。
六个参数 initialHeight、placeholderMessages、css、html、jsFunctions、jsExpressions 必须齐全，
静态页面也要提供 jsFunctions: \"\" 和 jsExpressions: []。
所有依赖异步 import 的场景都在同一个 async 初始化函数内完成按钮绑定、首次绘制和启动动画，
不要在另一个独立表达式中抢先绑定控件。jsExpressions 使用返回初始化 Promise 的调用。
外层 catch 必须显示中文错误并重新抛出，让宿主能够确认失败，禁止只报告成功。
canvas 使用独立空容器，HUD、状态栏和按钮放在它外面；禁止 replaceChildren/innerHTML 清空
包含这些控件的父容器。初始化前核对所有 getElementById 的 ID 确实存在于 HTML。
成功调用 generateSandboxedUi 后只需简短说明完成，不要再次生成同一页面。
"""


def ui_output_error(args):
    if not isinstance(args, dict):
        return "页面参数不是完整对象"
    for key, kind in (("initialHeight", (int, float)), ("placeholderMessages", list),
                      ("css", str), ("html", str), ("jsFunctions", str), ("jsExpressions", list)):
        if key not in args or not isinstance(args[key], kind):
            return f"页面参数缺少或损坏：{key}"
    if not all(isinstance(item, str) for item in args["jsExpressions"]):
        return "初始化表达式格式错误"
    if not args["html"].strip():
        return "页面 HTML 为空"
    if args["jsFunctions"].strip() and not args["jsExpressions"]:
        return "页面缺少初始化调用"
    if (re.search(r"<(button|input|select|canvas)\b", args["html"], re.I)
            and not args["jsFunctions"].strip() and "<script" not in args["html"].lower()):
        return "交互页面缺少 JavaScript"
    if len(json.dumps(args, ensure_ascii=False).encode("utf-8")) > MAX_UI_BYTES:
        return "页面代码过大"
    if NODE_EXECUTABLE and args["jsFunctions"].strip():
        # Parse only: never execute model-generated source on the host. Node is
        # available in this project's local development runtime; Python-only
        # deployments retain the browser's syntax guard.
        try:
            checked = subprocess.run([NODE_EXECUTABLE, "--check", "--input-type=commonjs"],
                input=args["jsFunctions"], encoding="utf-8", capture_output=True, timeout=3,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if checked.returncode:
                detail = next((line for line in checked.stderr.splitlines() if "SyntaxError:" in line), "无法解析 JavaScript")
                return f"JavaScript 语法错误：{detail[:180]}"
        except (OSError, subprocess.TimeoutExpired):
            return "JavaScript 语法检查未完成，请缩短代码后重试"
    return None


def response_error(response):
    for message in response.result:
        if not isinstance(message, AIMessage):
            continue
        calls = [call for call in message.tool_calls if call.get("name") == UI_TOOL]
        invalid = [call for call in message.invalid_tool_calls if call.get("name") == UI_TOOL]
        if invalid:
            return "页面工具 JSON 被截断"
        for call in calls:
            metadata = message.response_metadata
            if metadata.get("finish_reason") == "length" or metadata.get("stop_reason") == "max_tokens":
                return "页面输出达到模型长度上限"
            error = ui_output_error(call.get("args"))
            if error:
                return error
    return None


class CompleteUIOutputMiddleware(AgentMiddleware):
    """Retry incomplete output twice; never hand a truncated call to the client."""

    @staticmethod
    def request_for_attempt(request, error=None):
        # A successful UI call must be followed by the normal tool result and
        # completion, not another synthetic user request to generate a page.
        for message in reversed(request.messages):
            if isinstance(message, HumanMessage):
                break
            if isinstance(message, AIMessage) and any(call.get("name") == UI_TOOL for call in message.tool_calls):
                return request
        instruction = COMPACT_UI_INSTRUCTION
        if error:
            instruction += f"\n上次输出无效（{error}）。重新生成更精简的完整页面，保留用户要求的交互。"
        # Keep the actual user request (including an explicitly named skill)
        # as the last human message. These are execution constraints, not a
        # replacement request to generate something on every model turn.
        system = request.system_message
        if system is None:
            system = SystemMessage(content=instruction)
        elif isinstance(system.content, str):
            system = system.model_copy(update={"content": f"{system.content}\n\n{instruction}"})
        else:
            system = system.model_copy(update={"content": [*system.content, {"type": "text", "text": instruction}]})
        return request.override(system_message=system)

    def wrap_model_call(self, request, handler):
        error = None
        for attempt in range(3):
            response = handler(self.request_for_attempt(request, error))
            error = response_error(response)
            if error is None:
                return response
            logger.warning("Incomplete UI output (attempt=%s): %s", attempt + 1, error)
        raise ValueError(f"页面代码生成不完整，已重试两次：{error}")

    async def awrap_model_call(self, request, handler):
        error = None
        for attempt in range(3):
            response = await handler(self.request_for_attempt(request, error))
            error = response_error(response)
            if error is None:
                return response
            logger.warning("Incomplete UI output (attempt=%s): %s", attempt + 1, error)
        raise ValueError(f"页面代码生成不完整，已重试两次：{error}")
