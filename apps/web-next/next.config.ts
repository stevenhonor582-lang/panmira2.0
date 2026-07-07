import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "", // 切换: 服务根路径
  trailingSlash: true,
  allowedDevOrigins: ["deepx.fun", "*.deepx.fun", "localhost", "127.0.0.1"],

  async redirects() {
    return [
      // 阶段 1 删了 14 个老路由,补 301 redirect 到新路由(避免直接 404)
      { source: "/alerts", destination: "/diagnosis-center?tab=alerts", permanent: true },
      { source: "/diagnose", destination: "/diagnosis-center?tab=diagnose", permanent: true },
      { source: "/cost", destination: "/data-analytics?tab=cost", permanent: true },
      { source: "/reports", destination: "/data-analytics?tab=usage", permanent: true },
      { source: "/audit", destination: "/data-analytics?tab=audit", permanent: true },
      { source: "/skills/dags", destination: "/resources?tab=skills", permanent: true },
      { source: "/settings/projects", destination: "/", permanent: true },
      { source: "/settings/bots", destination: "/agents", permanent: true },
    ];
  },
};

export default nextConfig;
