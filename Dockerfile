# UNSAID Studio - production image for hosts with a persistent volume (Railway, Fly.io, Render).
# Mount a volume at /data and set UNSAID_STORAGE_DIR=/data (database, research, media live there).
# STUDIO_ACCESS_TOKEN is required: without it the app refuses non-loopback requests.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 UNSAID_STORAGE_DIR=/data
WORKDIR /app
RUN useradd --system --uid 1001 unsaid && mkdir -p /data && chown unsaid:unsaid /data
COPY --from=build --chown=unsaid:unsaid /app/.next/standalone ./
COPY --from=build --chown=unsaid:unsaid /app/.next/static ./.next/static
COPY --from=build --chown=unsaid:unsaid /app/public ./public
# Migrations are applied automatically on first database open.
COPY --from=build --chown=unsaid:unsaid /app/drizzle ./drizzle
USER unsaid
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
