"""Offline MCP registration and data-path contract; never starts a browser."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import types

root = Path(sys.argv[1])
registered = []
class FakeFastMCP:
    def __init__(self, *args, **kwargs):
        pass
    def tool(self, *args, **kwargs):
        def register(function):
            registered.append(function.__name__)
            return function
        return register

for name in ("mcp", "mcp.server", "mcp.server.fastmcp"):
    sys.modules[name] = types.ModuleType(name)
sys.modules["mcp.server.fastmcp"].FastMCP = FakeFastMCP
spec = importlib.util.spec_from_file_location("douyin_runtime", root / "mcp/mcp_server.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.HOME == Path(os.environ["DSH_DOUYIN_HOME"]).resolve()
assert module.QR_PNG == module.HOME / "cache/login-qr.png"
assert module.CAPTCHA_FLAG == module.HOME / "state/.need-captcha"
assert module.RUNTIME["version"] == "0.2.9"
assert not (set(registered) & module.WRITE_TOOL_NAMES)
assert "douyin_watch" in registered
assert "douyin_feed" in registered
assert not any(name.startswith("memory_") for name in registered)
print(json.dumps({"ok": True, "registered": len(registered), "writes": False}))
