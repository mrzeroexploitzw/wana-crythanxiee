FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=10000
ENV DATA_DIR=/var/data
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
        curl \
    && pip3 install --break-system-packages --no-cache-dir -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

# More tolerant dependency installation
RUN npm install \
    --omit=dev \
    --legacy-peer-deps \
    --no-audit \
    --no-fund \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000

COPY . .

RUN mkdir -p \
    /var/data/downloads \
    /var/data/auth \
    /var/data/temp \
    /var/data/logs

EXPOSE 10000

CMD ["npm", "start"]
