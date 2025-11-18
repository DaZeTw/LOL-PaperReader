# Base stage
FROM node:22-slim AS base
WORKDIR /app

# Remove yarn completely to force npm usage
RUN corepack disable yarn 2>/dev/null || true && \
    rm -f /usr/local/bin/yarn /usr/bin/yarn 2>/dev/null || true && \
    rm -rf ~/.yarn /usr/local/share/.yarn 2>/dev/null || true && \
    echo "Yarn has been completely removed"

# Copy entrypoint and dev wrapper scripts
COPY docker-entrypoint.sh /usr/local/bin/
COPY dev-wrapper.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/dev-wrapper.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Copy package.json first
COPY package.json ./

# Install all dependencies (dev + prod) to build Next
# This will create package-lock.json if it doesn't exist
RUN npm install --legacy-peer-deps \
  && cp -R node_modules /opt/node_modules_cached

# Copy package-lock.json if it exists on host (optional, npm install already created it)
COPY package-lock.json* ./

# Copy all code
COPY . .

# Disable lightningcss (Next fallback về PostCSS)
ENV NEXT_PRIVATE_DISABLE_LIGHTNINGCSS=1
ENV NEXT_TELEMETRY_DISABLED=1

# Build production
RUN npm run build

# Production stage
FROM node:22-slim
WORKDIR /app

# Remove yarn completely
RUN corepack disable yarn 2>/dev/null || true && \
    rm -f /usr/local/bin/yarn /usr/bin/yarn 2>/dev/null || true && \
    rm -rf ~/.yarn /usr/local/share/.yarn 2>/dev/null || true

# Copy entrypoint and dev wrapper scripts (for dev mode)
COPY docker-entrypoint.sh /usr/local/bin/
COPY dev-wrapper.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/dev-wrapper.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

ENV NODE_ENV=production
ENV NEXT_PRIVATE_DISABLE_LIGHTNINGCSS=1
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --legacy-peer-deps --production

# Copy built application from base stage
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
CMD ["npm", "run", "start"]