import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the Turbopack variant explicit; the webpack WASM rule below is only
  // used by the webpack matrix entry.
  turbopack: {},
  transpilePackages: ['@copc-test/fixture-client', '@copc-test/fixture-server', '@copc-test/harness-core', '@copc-test/test-contract'],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.module.rules.push({
        enforce: 'pre',
        test: /copc-adapter.*[\\/]datasetLocalFrame-[^\\/]+\.js$/,
        use: resolve(process.cwd(), '../../tools/nextClientAdapterUrlLoader.cjs'),
      });
    }
    config.module.rules.push({
      test: /\.wasm$/i,
      resourceQuery: /url/,
      type: 'asset/resource',
    });
    return config;
  },
};

export default nextConfig;
