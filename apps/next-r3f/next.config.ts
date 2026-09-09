import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.module.rules.push({
      test: /\.wasm$/i,
      resourceQuery: /url/,
      type: 'asset/resource',
    });
    return config;
  },
};

export default nextConfig;
