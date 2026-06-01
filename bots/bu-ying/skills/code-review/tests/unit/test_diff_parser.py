#!/usr/bin/env python3
"""
unit/diff-parser.test.py — diff-parser 单元测试
运行: cd bots/bu-ying/skills/code-review && python3 -m pytest tests/unit/ -v
依赖: pytest（已假定安装；如未装则用 unittest 兜底）
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

# 让脚本能从项目根 import
SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = SKILL_ROOT / "scripts"
DIFF_PARSER = SCRIPTS / "diff-parser.py"


def run_diff_parser(diff_text: str) -> list:
    """调用 diff-parser.py 并返回 JSON 结果。"""
    proc = subprocess.run(
        [sys.executable, str(DIFF_PARSER)],
        input=diff_text,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"diff-parser failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestDiffParser(unittest.TestCase):
    """diff-parser 行为测试（5 个核心 case）"""

    def test_01_standard_unified_diff(self):
        """标准 unified diff：单文件、增/删/上下文混合"""
        diff = """diff --git a/src/api.py b/src/api.py
index 111..222 100644
--- a/src/api.py
+++ b/src/api.py
@@ -1,3 +1,4 @@
 def hello():
-    return "old"
+    return "new"
+    print("added")
"""
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["file"], "src/api.py")
        self.assertEqual(result[0]["language"], "python")
        self.assertEqual(result[0]["additions"], 2)
        self.assertEqual(result[0]["deletions"], 1)
        self.assertEqual(len(result[0]["hunks"]), 1)
        lines = result[0]["hunks"][0]["lines"]
        types = [ln["type"] for ln in lines]
        self.assertIn("ctx", types)
        self.assertIn("del", types)
        self.assertIn("add", types)

    def test_02_multi_file_diff(self):
        """多文件 diff：解析两个独立文件"""
        diff = """diff --git a/src/a.py b/src/a.py
index 1..2 100644
--- a/src/a.py
+++ b/src/a.py
@@ -1,2 +1,3 @@
 x = 1
+y = 2
 z = 3
diff --git a/src/b.ts b/src/b.ts
index 3..4 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
"""
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 2)
        files = {r["file"] for r in result}
        self.assertEqual(files, {"src/a.py", "src/b.ts"})
        # 语言检测
        langs = {r["file"]: r["language"] for r in result}
        self.assertEqual(langs["src/a.py"], "python")
        self.assertEqual(langs["src/b.ts"], "typescript")
        # 每个文件 1 个 add
        for r in result:
            self.assertEqual(r["additions"], 1)
            self.assertEqual(r["deletions"], 0)

    def test_03_binary_file_detection(self):
        """二进制文件检测：is_binary=True"""
        diff = """diff --git a/images/logo.png b/images/logo.png
index abc..def 100644
--- a/images/logo.png
+++ b/images/logo.png
Binary files a/images/logo.png and b/images/logo.png differ
"""
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["is_binary"])
        self.assertEqual(result[0]["file"], "images/logo.png")
        self.assertEqual(result[0]["hunks"], [])

    def test_04_empty_diff(self):
        """空 diff：返回空数组"""
        result = run_diff_parser("")
        self.assertEqual(result, [])

        result = run_diff_parser("\n\n\n")
        self.assertEqual(result, [])

    def test_05_special_characters_in_content(self):
        """特殊字符：包含中文、引号、Unicode 符号"""
        diff = '''diff --git a/src/i18n.ts b/src/i18n.ts
index 1..2 100644
--- a/src/i18n.ts
+++ b/src/i18n.ts
@@ -1,3 +1,4 @@
 export const greeting = "hello";
+export const greeting_zh = "你好，世界！🌏";
+export const greeting_with_quote = "He said: \\"Hi\\"";
 export const farewell = "bye";
'''
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["additions"], 2)
        self.assertEqual(result[0]["language"], "typescript")
        added_contents = [
            ln["content"] for ln in result[0]["hunks"][0]["lines"]
            if ln["type"] == "add"
        ]
        self.assertIn('export const greeting_zh = "你好，世界！🌏";', added_contents)
        self.assertIn('export const greeting_with_quote = "He said: \\"Hi\\"";', added_contents)


class TestDiffParserAdvanced(unittest.TestCase):
    """额外测试：rename / multiple hunks / no newline marker"""

    def test_rename_detection(self):
        """文件重命名：is_renamed=True"""
        diff = """diff --git a/old_name.py b/new_name.py
similarity index 90%
rename from old_name.py
rename to new_name.py
index abc..def 100644
--- a/old_name.py
+++ b/new_name.py
@@ -1,2 +1,2 @@
-def foo():
+def bar():
"""
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["is_renamed"])
        self.assertEqual(result[0]["file"], "new_name.py")
        self.assertEqual(result[0]["old_file"], "old_name.py")

    def test_no_newline_marker(self):
        """无 newline 标记：\\ No newline at end of file"""
        diff = """diff --git a/single.py b/single.py
index 1..2 100644
--- a/single.py
+++ b/single.py
@@ -1,1 +1,1 @@
-old line
+new line
\\ No newline at end of file
"""
        result = run_diff_parser(diff)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["additions"], 1)
        self.assertEqual(result[0]["deletions"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
