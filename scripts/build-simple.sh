#!/bin/bash

set -e

echo "Starting esbuild-based build process..."

# Create dist directories
mkdir -p dist/client dist/server

echo "Building client with esbuild..."
npx esbuild src/client/index.tsx \
  --bundle \
  --platform=browser \
  --target=es2020 \
  --format=esm \
  --outdir=dist/client \
  --sourcemap=false \
  --minify \
  --tree-shaking=true \
  --splitting \
  --chunk-names=assets/[name]-[hash] \
  --asset-names=assets/[name]-[hash][extname] \
  --entry-names=assets/[name]-[hash] \
  --loader:.css=css \
  --loader:.module.css=css \
  --loader:.png=file \
  --loader:.jpg=file \
  --loader:.jpeg=file \
  --loader:.gif=file \
  --loader:.svg=file \
  --loader:.ico=file \
  --loader:.webp=file \
  --css-modules \
  --metafile=dist/client/meta.json

echo "Client build completed successfully!"

echo "Building server with esbuild..."
npx esbuild src/server/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outdir=dist/server \
  --sourcemap=false \
  --external:express \
  --external:vite \
  --external:fs \
  --external:path \
  --external:crypto \
  --external:http \
  --external:url \
  --external:util \
  --external:lru-cache \
  --external:node:* \
  --tree-shaking=true

echo "Server build completed successfully!"

# Verify build outputs
echo "Verifying build outputs..."
if [ ! -f "dist/server/index.js" ]; then
    echo "ERROR: Server build output not found!"
    exit 1
fi

if [ ! -d "dist/client/assets" ]; then
    echo "ERROR: Client build output not found!"
    exit 1
fi

echo "Build verification passed!"
echo "Build completed successfully!"
