FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Seed is idempotent (creates tables + demo data only if missing), then start.
CMD ["sh", "-c", "node scripts/seed.js && node src/server.js"]
