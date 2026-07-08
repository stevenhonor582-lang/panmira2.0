#!/usr/bin/env python3
"""
R16-2: MCP STDIO probe — 启动子进程,发 initialize + tools/list,返回 JSON.
用法:
  mcp-stdio-probe.py /path/to/script.py [extra args...]
  mcp-stdio-probe.py -- command arg1 arg2
  mcp-stdio-probe.py stdio:///path/to/script.py
输出 (stdout 一行 JSON):
  {"ok":bool,"tools":[...],"error":null|string,"stderr":"..."}
"""
import json
import os
import subprocess
import sys
import threading
import time

def normalize_cmd(argv):
    """Convert argv into a runnable command list."""
    if not argv:
        return None
    # Drop leading "--" if present
    if argv[0] == "--":
        argv = argv[1:]
    if not argv:
        return None
    # stdio:///path
    if argv[0].startswith("stdio://"):
        path = argv[0][len("stdio://"):]
        # path is "//realpath" or "/realpath"
        if path.startswith("//"):
            path = path[1:]
        argv = [path] + argv[1:]
    # npx:///@scope/pkg → npx -y @scope/pkg
    if argv[0].startswith("npx://"):
        pkg = argv[0][len("npx://"):]
        # strip leading triple slash if any
        pkg = pkg.lstrip("/")
        return ["npx", "-y", pkg] + argv[1:]
    # Single .py file → run with python3 (or detect venv)
    if len(argv) == 1 and argv[0].endswith(".py"):
        # Prefer venv if httpx/mcp available there
        venv_py = "/home/ubuntu/minimax-venv/bin/python"
        if os.path.exists(venv_py):
            return [venv_py, argv[0]]
        return ["python3", argv[0]]
    return argv

def read_json_line(stream, timeout=5.0):
    """Read one line, parse JSON. Skip Content-Length framing if present."""
    result = [None]
    def worker():
        while True:
            line = stream.readline()
            if not line:
                return
            line = line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            # Skip LSP framing headers
            if line.lower().startswith("content-length:") or line.startswith("Content-Length:"):
                continue
            try:
                result[0] = json.loads(line)
                return
            except json.JSONDecodeError:
                continue
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    t.join(timeout=timeout)
    return result[0]

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "tools": [], "error": "missing command"}))
        sys.exit(0)

    cmd = normalize_cmd(sys.argv[1:])
    if not cmd:
        print(json.dumps({"ok": False, "tools": [], "error": "empty command"}))
        sys.exit(0)

    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    # MCP servers using stdio usually need these cleared
    env.pop("MCP_SERVER", None)

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
    except FileNotFoundError as e:
        print(json.dumps({"ok": False, "tools": [], "error": f"command not found: {e.filename or e}"}))
        return
    except Exception as e:
        print(json.dumps({"ok": False, "tools": [], "error": f"spawn failed: {e}"}))
        return

    init_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "panmira-probe", "version": "1.0.0"},
        },
    }
    tools_req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}

    try:
        # Send initialize
        try:
            proc.stdin.write((json.dumps(init_req) + "\n").encode())
            proc.stdin.flush()
        except BrokenPipeError:
            # Process exited during spawn — read stderr
            time.sleep(0.2)
            err = proc.stderr.read()[:500].decode("utf-8", errors="replace") if proc.stderr else ""
            print(json.dumps({"ok": False, "tools": [], "error": f"process exited during init (broken pipe). stderr: {err}"}))
            return

        # Give it time to start (or exit)
        time.sleep(0.5)
        rc = proc.poll()
        if rc is not None:
            err = b""
            try:
                err = proc.stderr.read()[:500]
            except Exception:
                pass
            err_str = err.decode("utf-8", errors="replace") if isinstance(err, bytes) else str(err)
            print(json.dumps({"ok": False, "tools": [], "error": f"process exited rc={rc} before init. stderr: {err_str}"}))
            return

        init_resp = read_json_line(proc.stdout, timeout=5.0)
        if not init_resp:
            print(json.dumps({"ok": False, "tools": [], "error": "initialize timeout (5s)"}))
            proc.kill()
            return

        # Send initialized notification (some servers require it)
        notif = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        try:
            proc.stdin.write((json.dumps(notif) + "\n").encode())
            proc.stdin.flush()
        except BrokenPipeError:
            pass

        # tools/list
        try:
            proc.stdin.write((json.dumps(tools_req) + "\n").encode())
            proc.stdin.flush()
        except BrokenPipeError:
            print(json.dumps({"ok": False, "tools": [], "error": "process exited before tools/list"}))
            return

        tools_resp = read_json_line(proc.stdout, timeout=5.0)
        if not tools_resp:
            print(json.dumps({"ok": False, "tools": [], "error": "tools/list timeout (5s)"}))
            proc.kill()
            return

        tools = []
        if isinstance(tools_resp, dict):
            result = tools_resp.get("result", {})
            if isinstance(result, dict):
                tools = result.get("tools", []) or []
            elif isinstance(result, list):
                tools = result
        # Trim tool schema size for storage
        slim = []
        for t in tools[:100]:
            if isinstance(t, dict):
                slim.append({
                    "name": t.get("name", ""),
                    "description": (t.get("description") or "")[:200],
                })
        print(json.dumps({"ok": True, "tools": slim, "error": None}))

    finally:
        try:
            proc.kill()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == "__main__":
    main()
