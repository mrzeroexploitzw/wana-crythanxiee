FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates curl \
 && pip3 install --break-system-packages -U yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p /var/data/downloads /var/data/auth /var/data/temp /var/data/logs
ENV NODE_ENV=production
ENV DATA_DIR=/var/data
ENV PORT=10000

EXPOSE 10000
CMD ["npm","start"]
