# Stage 1: Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (like better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors first to cache dependencies layer
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all dependencies (development + production)
RUN npm ci

# Copy the source code
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Build both client (React SPA) and server (TypeScript backend)
RUN npm run build

# Prune development dependencies to keep final production node_modules minimal
RUN npm prune --omit=dev


# Stage 2: Runner stage
FROM node:20-slim AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Copy package configurations and pruned node_modules from the builder stage
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/package.json ./client/
COPY --from=builder /app/client/dist ./client/dist

# Create SQLite database directory (this is where persistent volumes should be mounted)
RUN mkdir -p /app/server/data

# Expose port 3001 (default)
EXPOSE 3001

# Start the server
CMD ["node", "server/dist/index.js"]
