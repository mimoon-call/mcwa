// vite.config.dev.ts - Development-only configuration
import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  plugins: [], // No React plugin to avoid preamble detection issues
  root: '.',
  css: {
    modules: {
      scopeBehaviour: 'local',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'src/client'),
      '@client-constants': path.resolve(__dirname, 'src/client/shared/constants'),
      '@components': path.resolve(__dirname, 'src/client/shared/components'),
      '@helpers': path.resolve(__dirname, 'src/client/shared/helpers'),
      '@hooks': path.resolve(__dirname, 'src/client/shared/hooks'),
      '@models': path.resolve(__dirname, 'src/client/shared/models'),
      '@services': path.resolve(__dirname, 'src/client/shared/services'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@server-constants': path.resolve(__dirname, 'src/server/constants'),
      '@server-services': path.resolve(__dirname, 'src/server/services'),
    },
  },
  // Use esbuild for JSX processing instead of React plugin
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  // Configure to avoid processing problematic files
  optimizeDeps: {
    exclude: [
      '@components/Icon/Icon.json',
      '@components/Icon/Icon.type',
      '@components/Icon/Icon'
    ]
  }
});
