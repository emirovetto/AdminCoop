import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/*": ["./prisma/schema.prisma", "./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/**/*"],
  },
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
