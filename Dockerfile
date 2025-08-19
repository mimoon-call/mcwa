# Use a more compatible base image for ARM64
FROM --platform=linux/arm64 node:20.18.1-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies and handle rollup issue
RUN npm ci && \
    npm install --save-dev @rollup/rollup-linux-arm64-musl

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM --platform=linux/arm64 node:20.18.1-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies and ensure rollup binary is available
RUN npm ci --only=production && \
    npm install --save-dev @rollup/rollup-linux-arm64-musl

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose server
EXPOSE 3000

# Start your SSR server
CMD ["npm", "run", "start"]
