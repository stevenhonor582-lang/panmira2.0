#!/usr/bin/env python3
"""
fetch-metrics.py — 拉监控指标（mock 数据，生产环境对接 Prometheus）
输入: $1 = 服务名, $2 = 时间窗（如 5m / 1h）
输出: JSON { service, window, metrics: {error_rate, p99_ms, qps, ...}, source }
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import random
import sys
from datetime import datetime, timezone


def mock_metrics(service: str) -> dict:
    """生成 mock 指标（基于服务名 hash 让结果稳定）"""
    rng = random.Random(service)
    error_rate = round(rng.uniform(0, 100), 2)
    p99_ms = rng.randint(50, 12000)
    qps = rng.randint(10, 10000)
    cpu = round(rng.uniform(5, 95), 1)
    mem = round(rng.uniform(10, 90), 1)
    return {
        "error_rate": error_rate,
        "p50_ms": rng.randint(10, 500),
        "p99_ms": p99_ms,
        "qps": qps,
        "cpu_pct": cpu,
        "mem_pct": mem,
        "active_connections": rng.randint(1, 1000),
    }


def main() -> int:
    service = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    window = sys.argv[2] if len(sys.argv) > 2 else "5m"

    if not service:
        print("Error: service name required", file=sys.stderr)
        return 64

    metrics = mock_metrics(service)
    output = {
        "service": service,
        "window": window,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "source": "mock",
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
