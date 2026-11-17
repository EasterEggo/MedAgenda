import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @medagenda/shared ships TypeScript source, so Next must compile it.
  transpilePackages: ["@medagenda/shared"],
};

export default nextConfig;
