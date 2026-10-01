import fs from "node:fs";
import { config } from "./config.js";
import { getState } from "./store.js";

export function card(title, body, extra = "") {
  const s = getState();
  const name = s.botName || config.botName;
  const group = s.groupLink || config.groupLink;
  return [
    `╭─── 🤖 ${name} ───╮`,
    `│ ${title}`,
    `├────────────────────`,
    body,
    extra ? `│ ${extra}` : "",
    `├────────────────────`,
    `│ 📣 Channel: ${config.channelLink}`,
    `│ 👥 Join Group: ${group || "Not configured"}`,
    `│ ⚡ ${s.prefix || config.prefix}menu  •  ${s.prefix || config.prefix}help`,
    `╰────────────────────╯`
  ].filter(Boolean).join("\n");
}

export function hasBrandImage() {
  try { return fs.existsSync(config.botImagePath); } catch { return false; }
}

export function brandImageBuffer() {
  try { return fs.readFileSync(config.botImagePath); } catch { return null; }
}

export const menuCard = () => card("MAIN MENU", [
  "📥 *MEDIA DOWNLOADER*",
  "• /download <url>  /video  /audio  /image",
  "• /info <url>  /formats <url>  /apps <url>",
  "",
  "👥 *GROUP MANAGEMENT*",
  "• /groupinfo  /admins  /tagadmins",
  "• /promote  /demote  /kick  /add  /mute",
  "",
  "🛡️ *MODERATION*",
  "• /antilink  /antispam  /antiflood",
  "• /warn  /warnings  /resetwarn",
  "",
  "👋 *WELCOME & RULES*",
  "• /welcome  /goodbye  /rules  /setrules",
  "",
  "🔐 *OWNER & PAIRING*",
  "• /ping  /status  /owner",
  "• /pair  /unpair  /reconnect  /sessions",
  "• /bot  /setbotname  /setbotimage  /setgrouplink"
].join("\n"));

export const statusCard = (info) => card("BOT STATUS", [
  `🟢 Status: ${info.connected ? "ONLINE" : "OFFLINE"}`,
  `⏱️ Uptime: ${info.uptime}`,
  `📦 Version: ${info.version}`,
  `📱 Platform: WhatsApp Web`,
  `👥 Groups: ${info.groups}`,
  `📥 Downloads: ${info.downloads}`,
  `🧵 Queue: ${info.queue}`
].join("\n"));

export const errorCard = (message) => card("ERROR", `⚠️ ${message}`);
export const successCard = (message) => card("SUCCESS", `✅ ${message}`);
