#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildClient() {
  try {
    // Create dist/client directory if it doesn't exist
    const outDir = 'dist/client';
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Copy static assets
    const publicDir = 'public';
    if (fs.existsSync(publicDir)) {
      const copyRecursive = (src, dest) => {
        if (fs.statSync(src).isDirectory()) {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          fs.readdirSync(src).forEach(file => {
            copyRecursive(path.join(src, file), path.join(dest, file));
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      };
      copyRecursive(publicDir, outDir);
      console.log('Static assets copied');
    }

    const result = await esbuild.build({
      entryPoints: ['src/client/index.tsx'],
      bundle: true,
      platform: 'browser',
      target: 'es2020',
      format: 'esm',
      outdir: outDir,
      sourcemap: false,
      minify: true,
      treeShaking: true,
      splitting: true,
      chunkNames: 'assets/[name]-[hash]',
      assetNames: 'assets/[name]-[hash][extname]',
      entryNames: 'assets/[name]-[hash]',
      // Handle CSS modules
      loader: {
        '.css': 'css',
        '.module.css': 'css',
        '.png': 'file',
        '.jpg': 'file',
        '.jpeg': 'file',
        '.gif': 'file',
        '.svg': 'file',
        '.ico': 'file',
        '.webp': 'file',
      },
      // External dependencies that should not be bundled
      external: [],
      // Define global variables
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      // Handle CSS modules
      cssModules: true,
      // Generate manifest files
      metafile: true,
      // Ensure proper resolution
      resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'],
      // Handle node modules
      nodePaths: ['node_modules'],
    });

    console.log('Client build completed successfully');
    
    // Generate manifest file
    const manifest = {
      entrypoints: ['assets/index-[hash].js'],
      assets: Object.keys(result.metafile.outputs).map(output => {
        const file = result.metafile.outputs[output];
        return {
          name: output,
          size: file.bytes,
          type: file.type
        };
      })
    };

    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('Manifest file generated');

  } catch (error) {
    console.error('Client build failed:', error);
    process.exit(1);
  }
}

buildClient();
