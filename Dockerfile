# Use Node LTS
FROM node:20.18.1-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Copy source code
COPY . .

# Install all dependencies
RUN npm ci

# Build the application
RUN npm run build

# Keep all dependencies since some are needed at runtime

# Expose server
EXPOSE 3000

# Start your SSR server
CMD ["npm", "run", "start"]
