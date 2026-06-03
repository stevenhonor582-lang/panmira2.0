# ---- Build stage ----
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (pg native)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install web dependencies and build
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --include=dev

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
COPY drizzle.config.ts ./

RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim

WORKDIR /app

# Install runtime deps
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy configs and scripts
COPY bin/ ./bin/
COPY scripts/ ./scripts/
COPY bots.example.json ./
COPY ecosystem.config.cjs ./

# Default environment
ENV NODE_ENV=production
ENV API_PORT=9100

EXPOSE 9100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f -H "Authorization: Bearer ${API_SECRET}" http://localhost:9100/api/health || exit 1

CMD ["node", "dist/index.js"]
