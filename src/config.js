import "dotenv/config";
import path from "node:path";

const dataDir = process.env.DATA_DIR || path.resolve("data");

export const config = {
  botName: process.env.BOT_NAME || "BEAUTXIE AI",
  prefix: process.env.BOT_PREFIX || "/",
  ownerNumber: (process.env.OWNER_NUMBER || "").replace(/\D/g, ""),
  pairingNumber: (process.env.PAIRING_NUMBER || "").replace(/\D/g, ""),
  pairingGroupJid: process.env.PAIRING_GROUP_JID || "",
  groupLink: process.env.GROUP_LINK || "https://chat.whatsapp.com/HCMyjAafc7nArxo2xhi648?s=cl&p=a&mlu=4&ilr=4",
  channelLink: process.env.CHANNEL_LINK || "https://whatsapp.com/channel/0029VbE9KJvJkK73C7RNvP2z",
  description: process.env.BOT_DESCRIPTION || "Your Digital Companion",
  botImagePath: process.env.BOT_IMAGE_PATH || path.join(dataDir, "beautxie-bot.png"),
  dataDir,
  authDir: path.join(dataDir, "auth"),
  downloadDir: path.join(dataDir, "downloads"),
  tempDir: path.join(dataDir, "temp"),
  logDir: path.join(dataDir, "logs"),
  port: Number(process.env.PORT || 10000),
  maxDownloadMB: Number(process.env.DOWNLOAD_MAX_MB || 100),
  downloadTtlMinutes: Number(process.env.DOWNLOAD_TTL_MINUTES || 30),
  maxConcurrentDownloads: Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2),
  userDownloadsPerHour: Number(process.env.USER_DOWNLOADS_PER_HOUR || 10),
  groupDownloadsPerHour: Number(process.env.GROUP_DOWNLOADS_PER_HOUR || 50),
  warnLimit: Number(process.env.WARN_LIMIT || 3),
  ownerToken: process.env.OWNER_TOKEN || "",
  autoWelcome: process.env.AUTO_WELCOME !== "false",
  autoGoodbye: process.env.AUTO_GOODBYE !== "false",
  antiLink: process.env.ANTI_LINK === "true",
  antiSpam: process.env.ANTI_SPAM !== "false",
  antiFlood: process.env.ANTI_FLOOD !== "false",
  welcomeBundleDelayMs: Number(process.env.WELCOME_BUNDLE_DELAY_MS || 3500),
  welcomeCooldownMs: Number(process.env.WELCOME_COOLDOWN_MS || 30000),
  maxWelcomeBatch: Number(process.env.MAX_WELCOME_BATCH || 25),
  welcomeMemberCooldownHours: Number(process.env.WELCOME_MEMBER_COOLDOWN_HOURS || 24),
  ytDlpPath: process.env.YT_DLP_PATH || "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg"
};
