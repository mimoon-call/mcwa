# Multi-stage build - let Docker detect the correct platform
FROM node:20.18.1-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies and force reinstall rollup to get correct binary
RUN npm ci && \
    npm uninstall rollup && \
    npm install rollup

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20.18.1-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies and ensure rollup binary is available
RUN npm ci --only=production && \
    npm install rollup

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose server
EXPOSE 3000

# Start your SSR server with environment variable debugging
CMD ["sh", "-c", "echo 'Environment variables:' && env | grep -E '(DB_URI|OPENAI_API_KEY|ACCESS_TOKEN_KEY|WEBHOOK_SECRET|SESSION_SECRET_KEY)' && echo 'Starting application...' && npm run start"]
