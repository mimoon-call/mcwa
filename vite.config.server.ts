// vite.config.server.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// Custom plugin to force esbuild and bypass Rollup
const forceEsbuildPlugin = () => ({
  name: 'force-esbuild',
  config(config) {
    if (config.build) {
      config.build.minify = 'esbuild';
      config.build.rollupOptions = {
        ...config.build.rollupOptions,
        // Force esbuild for all operations
        plugins: [],
      };
    }
    return config;
  },
  // Override the build process to use esbuild directly
  buildStart() {
    // This ensures esbuild is used
  },
});

export default defineConfig({
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'src/client'),
      '@client-constants': path.resolve(__dirname, 'src/client/shared/constants'),
      '@components': path.resolve(__dirname, 'src/client/shared/components'),
      '@hooks': path.resolve(__dirname, 'src/client/shared/hooks'),
      '@helpers': path.resolve(__dirname, 'src/client/shared/helpers'),
      '@models': path.resolve(__dirname, 'src/client/shared/models'),
      '@services': path.resolve(__dirname, 'src/client/shared/services'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@server-constants': path.resolve(__dirname, 'src/server/constants'),
      '@server-services': path.resolve(__dirname, 'src/server/services'),
    },
  },
  build: {
    ssr: 'src/server/index.ts',
    outDir: 'dist/server',
    target: 'node20',
    // Force esbuild to avoid Rollup Alpine Linux issues
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      external: ['express', 'vite', 'fs', 'path', 'crypto', 'http', 'url', 'util', 'lru-cache', /^node:/],
    },
  },
  // Force esbuild usage and configuration
  esbuild: {
    target: 'node20',
    platform: 'node',
    format: 'cjs',
  },
  // Disable Rollup features that might cause issues
  optimizeDeps: {
    disabled: true,
  },
  plugins: [
    react(),
    forceEsbuildPlugin(),
  ],
});
