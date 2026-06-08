#!/usr/bin/env python3
"""
fetch-logs.py — 拉日志（mock 数据，生产环境对接 Loki / ELK）
输入: $1 = 服务名, $2 = 关键词（可选）
输出: JSON { service, keyword, logs: [{ts, level, message}], source }
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import random
import sys
from datetime import datetime, timezone, timedelta


MOCK_TEMPLATES = [
    ("ERROR", "Connection pool exhausted (active=200, max=200)"),
    ("ERROR", "Database query timeout after 5s: SELECT * FROM orders"),
    ("ERROR", "Database connection refused"),
    ("WARN", "Slow request detected: /api/users took 3.2s (p99=800ms)"),
    ("ERROR", "5xx response from upstream service: mahubot-portal returned 502"),
    ("INFO", "Health check passed: 200 OK"),
    ("ERROR", "Uncaught exception: TypeError: Cannot read property 'id' of null"),
    ("WARN", "Cache miss rate elevated: hit_rate=45% (baseline=85%)"),
    ("ERROR", "Failed to connect to redis: ECONNREFUSED 10.0.1.5:6379"),
    ("ERROR", "Service timeout: upstream did not respond within 30s"),
    ("WARN", "High memory usage: 89% of heap allocated"),
    ("INFO", "Graceful shutdown initiated"),
]


def mock_logs(service: str, keyword: str, count: int = 5) -> list:
    rng = random.Random(f"{service}-{keyword}-{count}")
    logs = []
    now = datetime.now(timezone.utc)

    pool = list(MOCK_TEMPLATES)
    if keyword:
        kw_lower = keyword.lower()
        filtered = [
            (lvl, msg) for (lvl, msg) in pool
            if kw_lower in msg.lower() or kw_lower in lvl.lower()
        ]
        if filtered:
            pool = filtered

    for i in range(count):
        level, msg = rng.choice(pool)
        ts = (now - timedelta(seconds=i * 30)).isoformat()
        logs.append({"ts": ts, "level": level, "message": f"[{service}] {msg}"})

    rng.shuffle(logs)
    return logs


def main() -> int:
    service = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    keyword = sys.argv[2] if len(sys.argv) > 2 else ""

    if not service:
        print("Error: service name required", file=sys.stderr)
        return 64

    logs = mock_logs(service, keyword)
    output = {
        "service": service,
        "keyword": keyword,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(logs),
        "logs": logs,
        "source": "mock",
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
