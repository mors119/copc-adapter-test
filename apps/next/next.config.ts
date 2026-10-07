import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import { readAdapterSourceMetadata } from '../../tools/adapter-source/index.mjs';

const sourceMetadata = readAdapterSourceMetadata();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_COPC_PACKAGE_SOURCE: sourceMetadata.packageSource,
    NEXT_PUBLIC_COPC_PACKAGE_VERSION: sourceMetadata.packageVersion,
  },
  transpilePackages: [
    '@copc-test/core', '@copc-test/fixture-server', '@copc-test/renderers', '@copc-test/ui',
  ],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.module.rules.push({
        enforce: 'pre',
        test: /copc-adapter.*[\\/]datasetLocalFrame-[^\\/]+\.js$/,
        use: resolve(process.cwd(), '../../tools/nextClientAdapterUrlLoader.cjs'),
      });
    }
    config.module.rules.push({ test: /\.wasm$/i, resourceQuery: /url/, type: 'asset/resource' });
    return config;
  },
};

export default nextConfig;
