# Multi-stage build - let Docker detect the correct platform
FROM node:20.18.1-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies - npm will auto-detect correct rollup binary
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20.18.1-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies - npm will auto-detect correct rollup binary
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose server
EXPOSE 3000

# Start your SSR server
CMD ["npm", "run", "start"]
