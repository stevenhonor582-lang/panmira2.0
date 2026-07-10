/**
 * R49-B Step 7 — v1 deprecated header 中间件
 *
 * 设计:
 * - 自动给所有 v1 路由响应加 Deprecation header(无需逐路由改)
 * - 在 http-server.ts 主调度前注入(res.writeHead/res.setHeader 时 hook)
 * - Sunset: 2026-08-01(用户拍板: 共存 1 月,R49-B 内不删)
 * - Link: rel=successor-version 指向 v3
 *
 * v1 路径识别(对齐 PRD §10.2 + R49-UPGRADE-PLAN §0.2):
 * - /api/v1/*
 * - /api/bots/*       (老 IM bot 桥接口)
 * - /api/agents/*     (老 agents 端点)
 * - /api/skills       (老 skills 端点)
 *
 * 使用:
 *   import { wrapWithV1Deprecation } from '../middleware/v1-deprecation.js';
 *   wrapWithV1Deprecation(res, url);  // 在路由 dispatcher 入口调用一次
 */
import type * as http from 'node:http';

/** Sunset 日期(R49-B 拍板: 2026-08-01 后 v1 进入只读/可删阶段) */
export const V1_SUNSET_DATE = '2026-08-01';

/** v1 路径前缀列表 */
const V1_PREFIXES = [
  '/api/v1/',
  '/api/bots',
  '/api/agents',
  '/api/skills',
];

/** v1 → v3 推荐 successor 映射(粗匹配) */
const V1_TO_V3_SUCCESSOR: Array<{ from: RegExp; to: string }> = [
  { from: /^\/api\/v1\/memory/, to: '/api/v3/memory' },
  { from: /^\/api\/bots\//, to: '/api/v3/agents' },
  { from: /^\/api\/agents\//, to: '/api/v3/agents' },
];

/**
 * 判断 URL 是否为 v1 路径
 */
export function isV1Path(url: string): boolean {
  // 去掉 query string
  const path = url.split('?')[0];
  return V1_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/**
 * 推断 v3 successor URL(基于简单正则匹配)
 * 找不到匹配时返回通用提示
 */
export function inferSuccessor(url: string): string {
  for (const m of V1_TO_V3_SUCCESSOR) {
    if (m.from.test(url)) {
      return m.to;
    }
  }
  return '/api/v3/openapi.json'; // 默认让前端去查 openapi
}

/**
 * 给 ServerResponse 注入 v1 deprecation header
 * 调用一次即可(对单个 res 多次调用是幂等的)
 *
 * @returns true 如果是 v1 路径(并注入了 header)
 */
export function markV1Deprecated(res: http.ServerResponse, url: string): boolean {
  if (!isV1Path(url)) return false;
  if ((res as any)._v1DeprecatedMarked) return true; // 幂等

  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', V1_SUNSET_DATE);
  const successor = inferSuccessor(url);
  res.setHeader('Link', `<${successor}>; rel="successor-version"`);
  // 额外提示(非标准,但对调试有用)
  res.setHeader('X-Panmira-Deprecated', `v1 (sunset ${V1_SUNSET_DATE}); use ${successor}`);

  (res as any)._v1DeprecatedMarked = true;
  return true;
}

/**
 * 自动 hook res.setHeader 和 res.writeHead,确保任何代码路径设的 header
 * 都包含 v1 deprecation 标记(防止被覆盖)
 *
 * 使用方法: 在路由 dispatcher 入口(已经知道是 v1 路径)调用
 *   if (isV1Path(url)) hookResForDeprecation(res, url);
 *
 * 实现: 用 Proxy 不可行(Buffer + http 类型),所以 patch res.setHeader
 * 拦截"覆盖"行为,自动重新注入 Deprecation/Sunset/Link。
 */
export function hookResForDeprecation(res: http.ServerResponse, url: string): void {
  if (!isV1Path(url)) return;
  if ((res as any)._v1DeprecationHooked) return;

  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: string | number | readonly string[]): http.ServerResponse {
    originalSetHeader(name, value);
    // 任何后续 setHeader 调用后,强制重新注入 deprecation header
    // (覆盖情况下浏览器/客户端会取最后一次写入)
    if (name.toLowerCase() !== 'deprecation' &&
        name.toLowerCase() !== 'sunset' &&
        name.toLowerCase() !== 'link') {
      originalSetHeader('Deprecation', 'true');
      originalSetHeader('Sunset', V1_SUNSET_DATE);
      originalSetHeader('Link', `<${inferSuccessor(url)}>; rel="successor-version"`);
    }
    return res;
  };
  (res as any)._v1DeprecationHooked = true;
}
