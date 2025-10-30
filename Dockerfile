# Base stage
FROM node:22-slim AS base
WORKDIR /app

# Copy package.json + package-lock.json
COPY package*.json ./

# Install all dependencies (dev + prod) to build Next
RUN npm install --legacy-peer-deps

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