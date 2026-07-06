import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/web-next",
  trailingSlash: true,
  allowedDevOrigins: ["deepx.fun", "*.deepx.fun", "localhost", "127.0.0.1"],
};

export default nextConfig;
