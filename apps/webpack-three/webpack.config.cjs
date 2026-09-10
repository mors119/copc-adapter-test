const path = require('node:path');

const appDirectory = __dirname;

module.exports = {
  experiments: { outputModule: true },
  entry: path.resolve(appDirectory, 'src/main.ts'),
  output: {
    path: path.resolve(appDirectory, 'dist'),
    filename: 'bundle.js',
    module: true,
    publicPath: 'auto',
    clean: true,
  },
  // Source maps would expose the adapter checkout path in production output.
  devtool: false,
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: { '.js': ['.js', '.ts'] },
  },
  module: {
    parser: {
      javascript: { url: false },
    },
    rules: [
      {
        test: /\.ts$/i,
        exclude: /node_modules/,
        use: [{
          loader: 'ts-loader',
          options: { configFile: path.resolve(appDirectory, 'tsconfig.json'), transpileOnly: true },
        }],
      },
      // @frillab/copc-adapter publishes WASM URL imports. Keep them as
      // standalone resources so the browser can fetch them from the bundle.
      {
        test: /\.wasm$/i,
        resourceQuery: /url/,
        type: 'asset/resource',
        generator: { filename: '[hash][ext]' },
      },
    ],
  },
  plugins: [
    new (require('webpack')).DefinePlugin({
      'typeof window': JSON.stringify('object'),
      'typeof document': JSON.stringify('object'),
      'typeof self': JSON.stringify('object'),
      'import.meta.url': 'document.baseURI',
    }),
    new (require('copy-webpack-plugin'))({
      patterns: [
        { from: path.resolve(appDirectory, 'src/index.html'), to: 'index.html' },
        { from: path.resolve(appDirectory, '../shared/bundler-smoke.css'), to: 'style.css' },
      ],
    }),
  ],
  performance: { hints: false },
};
