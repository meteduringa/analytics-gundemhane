# Multi-stage Dockerfile (Node.js applications)
# Assumptions:
# - package.json has a "start" script
# - optional "build" script will be executed if present
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source and run optional build
COPY . .
RUN npm run build || true

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Install production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Copy application files
COPY --from=builder /app ./

# Default port (can be overridden with ENV PORT)
ENV PORT=3000
EXPOSE 3000

# Start using package.json start script
CMD ["npm", "start"]