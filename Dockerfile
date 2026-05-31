# syntax=docker/dockerfile:1.7
# Multi-stage build for Underhack
# Final image runs both the Next.js server and the background worker
# via a tiny entrypoint script.

# ============================================================
# 1. deps — install with cache
# ============================================================
FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 needs build tools at install time
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package*.json ./
RUN npm ci --omit=optional

# ============================================================
# 2. build — produce Next standalone output
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package*.json ./
RUN npm ci
COPY . .
# Next.js apps don't always ship a public/ dir (and it's gitignored here),
# so guarantee it exists — the runtime stage unconditionally COPYs it.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# 3. runtime — small image, two processes
# ============================================================
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4317 \
    DB_PATH=/data/underhack.db

RUN apk add --no-cache tini libstdc++ \
 && addgroup -S underhack && adduser -S underhack -G underhack \
 && mkdir -p /data && chown -R underhack:underhack /data

COPY --from=build  --chown=underhack:underhack /app/.next         ./.next
COPY --from=build  --chown=underhack:underhack /app/public        ./public
COPY --from=build  --chown=underhack:underhack /app/package*.json ./
COPY --from=build  --chown=underhack:underhack /app/src           ./src
COPY --from=build  --chown=underhack:underhack /app/lib           ./lib
COPY --from=build  --chown=underhack:underhack /app/app           ./app
COPY --from=build  --chown=underhack:underhack /app/middleware.ts ./
COPY --from=build  --chown=underhack:underhack /app/next.config.* ./
COPY --from=build  --chown=underhack:underhack /app/tsconfig.json ./
COPY --from=deps   --chown=underhack:underhack /app/node_modules  ./node_modules

USER underhack
VOLUME ["/data"]
EXPOSE 4317

# Use tini so the web + worker pair get clean signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node node_modules/.bin/tsx src/worker.ts & exec node node_modules/next/dist/bin/next start -p 4317"]
