#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');

async function buildServer() {
  try {
    const result = await esbuild.build({
      entryPoints: ['src/server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outdir: 'dist/server',
      external: [
        'express',
        'vite',
        'fs',
        'path',
        'crypto',
        'http',
        'url',
        'util',
        'lru-cache',
        /^node:/
      ],
      sourcemap: false,
      minify: false,
      treeShaking: true,
    });

    console.log('Server build completed successfully');
    console.log('Output files:', result.outputFiles);
  } catch (error) {
    console.error('Server build failed:', error);
    process.exit(1);
  }
}

buildServer();
