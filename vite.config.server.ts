// vite.config.server.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
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
    target: 'node18',
    rollupOptions: {
      external: ['express', 'vite', 'fs', 'path'],
    },
  },
});
