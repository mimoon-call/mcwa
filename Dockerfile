# Use Node LTS (updated to be compatible with Vite 7)
FROM node:20.19.0-alpine

# Set working directory
WORKDIR /app

# Set environment variables for better build compatibility
ENV NODE_ENV=production
ENV VITE_FORCE_ESBUILD=true
ENV ROLLUP_SKIP_NATIVE=true
ENV ESBUILD_BINARY_PATH=/usr/local/bin/esbuild

# Copy package files first for better caching
COPY package*.json ./

# Copy source code
COPY . .

# Install all dependencies
RUN npm ci

# Build the application using multiple fallback options
RUN npm run build:simple || npm run build:pure || npm run build:esbuild || (echo "All builds failed" && exit 1)

# Keep all dependencies since some are needed at runtime

# Expose server
EXPOSE 3000

# Start your SSR server
CMD ["npm", "run", "start"]
