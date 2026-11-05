import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { "/*": ["./.data/**/*", "./.env*"] },
};

export default nextConfig;
