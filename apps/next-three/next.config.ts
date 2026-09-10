import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@copc-test/fixture-client', '@copc-test/harness-core', '@copc-test/test-contract'],
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
