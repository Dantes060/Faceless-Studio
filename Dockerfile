# syntax=docker/dockerfile:1

# Node 20 + ffmpeg (for real mp4 assembly). better-sqlite3 pulls a prebuilt
# binary during `npm ci`, so no compiler toolchain is needed.

FROM node:20-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- install dependencies (dev deps included: needed for the build) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
RUN mkdir -p /app/data
ENV PORT=3000
EXPOSE 3000
# SQLite + assets must live on a persistent volume.
VOLUME ["/app/data"]
CMD ["npm", "start"]
