import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/runs/\\[id\\]/visual/asset/\\[\\.\\.\\.path\\]": ["./node_modules/tailwindcss/index.css"]
  }
};

export default nextConfig;
