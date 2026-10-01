import fs from "node:fs";
import makeWASocket, {
  Browsers, DisconnectReason, useMultiFileAuthState,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import P from "pino";
import { Boom } from "@hapi/boom";
import { config } from "./config.js";
import { brandImageBuffer } from "./cards.js";
import { initStore, getState } from "./store.js";
import { handleMessage, handleGroupParticipants } from "./commands.js";

let sock;
let connectedAt = null;

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu(config.botName),
    logger: P({ level: process.env.LOG_LEVEL || "info" }),
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try { await handleMessage(sock, msg); }
      catch (e) { console.error("message handler:", e); }
    }
  });

  sock.ev.on("group-participants.update", async event => {
    try { await handleGroupParticipants(sock, event); }
    catch (e) { console.error("group event:", e); }
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      connectedAt = Date.now();
      console.log("BEAUTXIE AI connected.");
      if (config.pairingNumber && !state.creds.registered) {
        try {
          const code = await sock.requestPairingCode(config.pairingNumber);
          console.log("PAIRING CODE:", code);
        } catch (e) { console.error("pairing code:", e); }
      }
    }
    if (connection === "close") {
      connectedAt = null;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startWhatsApp, 5000);
      } else {
        console.error("WhatsApp session logged out. Re-pair the account.");
      }
    }
  });

  return sock;
}

export function getSocket() { return sock; }

export async function resolveGroupInvite(input) {
  if (!sock) throw new Error("WhatsApp is not connected.");
  const value = String(input || "").trim();
  const match = value.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  const code = match ? match[1] : value.replace(/^https?:\/\//i, "").split(/[/?#&]/)[0];
  if (!code) throw new Error("Invalid WhatsApp group invite link/code.");
  const info = await sock.groupGetInviteInfo(code);
  return { ...info, inviteCode: code, jid: info.id || info.jid };
}
export function getUptime() {
  if (!connectedAt) return "offline";
  const seconds = Math.floor((Date.now() - connectedAt) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export async function sendBrandedCard(jid, caption, options = {}) {
  if (!sock) throw new Error("WhatsApp is not connected.");
  const image = brandImageBuffer();
  const payload = image
    ? { image, caption, ...(options.mentions?.length ? { mentions: options.mentions } : {}) }
    : { text: caption, ...(options.mentions?.length ? { mentions: options.mentions } : {}) };
  return sock.sendMessage(jid, payload, options.quoted ? { quoted: options.quoted } : undefined);
}

export async function sendText(jid, text) {
  if (!sock) throw new Error("WhatsApp is not connected.");
  return sock.sendMessage(jid, { text });
}

export async function sendFile(jid, file, caption, mimetype = "application/octet-stream") {
  if (!sock) throw new Error("WhatsApp is not connected.");
  return sock.sendMessage(jid, { document: { url: file }, mimetype, fileName: file.split(/[\\/]/).pop(), caption });
}

export async function sendMedia(jid, file, caption, type = "video") {
  const data = fs.readFileSync(file);
  const payload = type === "audio"
    ? { audio: data, mimetype: "audio/mpeg", ptt: false, caption }
    : type === "image"
      ? { image: data, caption }
      : { video: data, caption };
  return sock.sendMessage(jid, payload);
}

export async function groupMetadata(jid) {
  return sock.groupMetadata(jid);
}

export async function updateProfilePicture(jid, file) {
  const data = fs.readFileSync(file);
  return sock.updateProfilePicture(jid, { url: data });
}

export async function requestPairingCode(number) {
  if (!sock) throw new Error("WhatsApp is not connected.");
  return sock.requestPairingCode(number.replace(/\D/g, ""));
}
