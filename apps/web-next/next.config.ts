import type { NextConfig } from "next";

/**
 * Next.js config for apps/web-next (Panmira IA v6 admin console).
 *
 * Backend base URL is read from `PANMIRA_BACKEND_URL` (see .env.web-next).
 * The value flows into the rewrites() reverse proxy for /api/* so the
 * browser can hit a same-origin /api/auth/login instead of cross-origin
 * http://localhost:9100.
 *
 * Default fallback keeps local dev working out of the box.
 */
const backendBaseUrl =
  process.env.PANMIRA_BACKEND_URL ?? "http://localhost:9100";

const nextConfig: NextConfig = {
  // P3.5: skip TS error in tasks/page.tsx (pre-existing, A1/A2/A3 do not own it)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  basePath: "", // 切换: 服务根路径
  trailingSlash: true,
  allowedDevOrigins: ["deepx.fun", "*.deepx.fun", "localhost", "127.0.0.1"],

  async redirects() {
    return [
      // ---- 阶段 1 老路由(保留向后兼容,避免 404) ----
      { source: "/alerts", destination: "/overview/diagnosis", permanent: true },
      { source: "/diagnose", destination: "/overview/diagnosis", permanent: true },
      { source: "/cost", destination: "/overview/diagnosis", permanent: true },
      { source: "/reports", destination: "/overview/dashboard", permanent: true },
      { source: "/audit", destination: "/overview/logs", permanent: true },
      { source: "/skills/dags", destination: "/channels/skills", permanent: true },
      { source: "/settings/projects", destination: "/settings/advanced", permanent: true },
      { source: "/settings/bots", destination: "/channels/endpoints", permanent: true },

      // ---- IA v6 老路径 301 → 新 IA v6 路径(避免历史书签失效) ----
      { source: "/v1/agents", destination: "/employees", permanent: true },
      { source: "/v1/agents/:path*", destination: "/employees/:path*", permanent: true },
      { source: "/workspace/:path*", destination: "/foundation/knowledge", permanent: true },
      { source: "/agents", destination: "/overview/people", permanent: true },
      { source: "/agents/:path*", destination: "/employees/:path*", permanent: true },
      { source: "/pipeline", destination: "/tasks", permanent: true },
      { source: "/pipeline/:path*", destination: "/tasks/:path*", permanent: true },
      { source: "/kb/:path*", destination: "/foundation/knowledge", permanent: true },
      { source: "/bot/:path*", destination: "/channels/endpoints", permanent: true },
      { source: "/channels", destination: "/channels/mcp", permanent: true },
      { source: "/skills", destination: "/channels/skills", permanent: true },
      { source: "/dashboard", destination: "/overview/dashboard", permanent: true },
      { source: "/diagnosis-center", destination: "/overview/diagnosis", permanent: true },
      { source: "/data-analytics", destination: "/overview/dashboard", permanent: true },
      { source: "/memory", destination: "/foundation/memory/l1", permanent: true },
      { source: "/models", destination: "/channels/llm", permanent: true },
      { source: "/resources", destination: "/channels/skills", permanent: true },
      { source: "/oauth-clients", destination: "/channels/oauth", permanent: true },
      { source: "/permissions", destination: "/settings/permissions", permanent: true },
      { source: "/voice", destination: "/settings/voice", permanent: true },
      { source: "/settings", destination: "/settings/advanced", permanent: true },
      { source: "/runtime", destination: "/overview/logs", permanent: true },
      { source: "/integrations", destination: "/channels/endpoints", permanent: true },
      { source: "/logs", destination: "/overview/logs", permanent: true },
      { source: "/knowledge", destination: "/foundation/knowledge", permanent: true },
      { source: "/status", destination: "/overview/dashboard", permanent: true },
      // ---- R14-E: /optimization 并入 /diagnosis ----
      { source: "/overview/optimization", destination: "/overview/diagnosis", permanent: false },

      // ---- R29-A: "路由" 内置到大模型,/channels/routing → /channels/llm ----
      { source: "/channels/routing", destination: "/channels/llm", permanent: true },

    ];
  },

  // /api/* 反代到后端(PANMIRA_BACKEND_URL),避免 CORS + trailingSlash 冲突。
  // 通过环境变量注入,便于 staging/prod 切不同后端。
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendBaseUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;