# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json .
COPY src ./src

# Build
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Default port for HTTP transport (if added in future) or just for documentation
# EXPOSE 3000

# Entry point
ENTRYPOINT ["node", "dist/index.js"]
