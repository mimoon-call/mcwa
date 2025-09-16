// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/client/',
  css: {
    modules: {
      scopeBehaviour: 'local', // default; ensures .module.css is scoped
      generateScopedName: '[name]__[local]___[hash:base64:5]', // optional
    },
    preprocessorOptions: {
      // if you're using SCSS, etc
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
  build: {
    outDir: 'dist/client',
    manifest: true,
    ssrManifest: true,
    target: 'esnext',
    assetsDir: 'assets',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/index.tsx'),
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.ico'],
});
