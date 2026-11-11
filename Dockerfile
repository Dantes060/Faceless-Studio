FROM node:20-bookworm-slim

# ffmpeg is required for the assemble stage (mp4 export).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Reproducible install from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# App source + production build.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

# SQLite DB + generated assets live here. Mount a volume at /app/data.
RUN mkdir -p /app/data

CMD ["npm", "start"]
