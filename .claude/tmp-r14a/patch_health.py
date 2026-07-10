"""Patch health-meters.tsx icon map to handle new R14-A health item names."""
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text(encoding='utf-8')

# Update icon import to include new icons
OLD_IMPORT = 'import { Database, Zap, Wifi, Search, BrainCircuit, type LucideIcon } from "lucide-react";'
NEW_IMPORT = 'import { Database, Zap, Wifi, Search, BrainCircuit, Server, Cpu, HardDrive, Users, type LucideIcon } from "lucide-react";'

OLD_ICONFN = '''function iconFor(name: string): LucideIcon {
  if (name.includes("数据库") || name.includes("DB")) return Database;
  if (name.includes("缓存")) return Zap;
  if (name.includes("WebSocket") || name.includes("websocket")) return Wifi;
  if (name.includes("RAG")) return Search;
  if (name.includes("Memory")) return BrainCircuit;
  return Database;
}'''

NEW_ICONFN = '''function iconFor(name: string): LucideIcon {
  // R14-A: 6 new health dimensions
  if (name.includes("系统服务")) return Server;
  if (name.includes("AI") || name.includes("大模型")) return BrainCircuit;
  if (name.includes("知识库") || name.includes("RAG")) return Search;
  if (name.includes("任务执行")) return Zap;
  if (name.includes("资源")) return HardDrive;
  if (name.includes("员工")) return Users;
  // legacy fallbacks
  if (name.includes("数据库") || name.includes("DB")) return Database;
  if (name.includes("缓存")) return Zap;
  if (name.includes("WebSocket") || name.includes("websocket")) return Wifi;
  if (name.includes("Memory")) return BrainCircuit;
  return Database;
}'''

# Update percentFor to handle new detail shapes
OLD_PCT = '''// 把不同维度的 value 归一化成 0-100 的进度（仅用于 meter 长度，不影响数字显示）
function percentFor(item: HealthItem): number {
  const d = item.detail ?? {};
  if (typeof d.ms === "number") {
    // <50ms=100, 200ms=0
    return Math.max(0, Math.min(100, ((200 - d.ms) / 150) * 100));
  }
  if (typeof d.percent === "number") return Math.max(0, Math.min(100, d.percent));
  if (item.status === "ok") return 92;
  if (item.status === "warn") return 55;
  return 18;
}'''

NEW_PCT = '''// 把不同维度的 value 归一化成 0-100 的进度（仅用于 meter 长度，不影响数字显示）
function percentFor(item: HealthItem): number {
  const d = (item.detail ?? {}) as Record<string, unknown>;
  // 系统服务: up/total
  if (typeof d.up === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.up / d.total) * 100);
  }
  // AI 大模型: reachable/total
  if (typeof d.reachable === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.reachable / d.total) * 100);
  }
  // 任务执行: rate
  if (typeof d.rate === "number") return Math.max(0, Math.min(100, d.rate));
  // 资源: 主要看磁盘 (低占用=健康=进度满)
  if (typeof d.diskPct === "number") {
    return Math.max(0, Math.min(100, 100 - d.diskPct));
  }
  // 正式员工活跃: active/total
  if (typeof d.active === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.active / d.total) * 100);
  }
  // legacy: DB ms
  if (typeof d.ms === "number") {
    return Math.max(0, Math.min(100, ((200 - d.ms) / 150) * 100));
  }
  // legacy: percent
  if (typeof d.percent === "number") return Math.max(0, Math.min(100, d.percent));
  if (item.status === "ok") return 92;
  if (item.status === "warn") return 55;
  return 18;
}'''

# Update subtitle "5 项核心检查" -> "6 项核心检查"
OLD_SUB = '<p className="mt-0.5 text-xs text-muted-foreground">5 项核心检查 · 实时探测</p>'
NEW_SUB = '<p className="mt-0.5 text-xs text-muted-foreground">系统/AI/KB/任务/资源/员工 · 实时探测</p>'

# Tighter row spacing so 6 items fit nicely
OLD_SPACE = '<ul className="mt-4 space-y-3.5">'
NEW_SPACE = '<ul className="mt-4 space-y-2.5">'

ok = True
for old, new, label in [
    (OLD_IMPORT, NEW_IMPORT, 'import'),
    (OLD_ICONFN, NEW_ICONFN, 'iconfn'),
    (OLD_PCT, NEW_PCT, 'pct'),
    (OLD_SUB, NEW_SUB, 'subtitle'),
    (OLD_SPACE, NEW_SPACE, 'spacing'),
]:
    if new in src:
        print(f'already applied: {label}')
        continue
    if old not in src:
        print(f'NOT FOUND: {label}', file=sys.stderr)
        ok = False
        continue
    src = src.replace(old, new, 1)
    print(f'patched: {label}')

if ok:
    target.write_text(src, encoding='utf-8')
    print('OK size:', len(src))
else:
    sys.exit(1)
