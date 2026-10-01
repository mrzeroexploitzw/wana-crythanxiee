import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { getState, getGroup, saveStore } from "./store.js";
import { card, menuCard, statusCard, errorCard, successCard } from "./cards.js";
import { allow, isDuplicate, floodCount } from "./limiter.js";
import { downloadMedia, queueSize } from "./downloader.js";
import { inspectApp } from "./apps.js";
import { getUptime, groupMetadata, sendMedia, sendBrandedCard, requestPairingCode, updateProfilePicture, resolveGroupInvite } from "./whatsapp.js";

const jidOf = m => m.key.remoteJid;
const senderOf = m => m.key.participant || m.key.remoteJid;
const numberOf = jid => (jid || "").split("@")[0].replace(/\D/g, "");
const textOf = m => m.message?.conversation || m.message?.extendedTextMessage?.text || "";
const isGroup = jid => jid?.endsWith("@g.us");

function isOwner(m) {
  return getState().owners.includes(numberOf(senderOf(m))) || numberOf(senderOf(m)) === config.ownerNumber;
}

async function reply(sock, m, text, mentions = []) {
  return sendBrandedCard(jidOf(m), text, { quoted: m, mentions });
}

async function groupAdmin(sock, m) {
  if (!isGroup(jidOf(m))) return false;
  const md = await groupMetadata(jidOf(m));
  const me = md.participants.find(p => p.id === sock.user.id || p.id?.split(":")[0] === sock.user.id?.split(":")[0]);
  const sender = md.participants.find(p => p.id === senderOf(m) || p.id?.split(":")[0] === senderOf(m)?.split(":")[0]);
  return Boolean(me?.admin && sender?.admin);
}

function argsFor(body) {
  return body.trim().split(/\s+/).slice(1);
}

function targetJid(m) {
  return m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
}

function requirePairGroup(m) {
  const configured = config.pairingGroupJid || getState().pairGroup;
  return !configured || jidOf(m) === configured;
}

export async function handleMessage(sock, m) {
  if (!m.message || m.key.fromMe) return;
  const jid = jidOf(m);
  const body = textOf(m).trim();
  if (!body) return;

  const state = getState();
  if (!state.botEnabled && !isOwner(m)) return;

  if (isGroup(jid) && config.antiFlood && floodCount(`${jid}:${senderOf(m)}`) > 8) {
    return reply(sock, m, card("ANTI-FLOOD", "🌊 Too many messages in a short period. Please slow down."));
  }

  const prefix = state.prefix || config.prefix;
  let command = "";
  let args = [];
  if (body.startsWith(prefix)) {
    command = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    args = argsFor(body);
  } else if (/^https?:\/\//i.test(body)) {
    command = "download";
    args = [body];
  } else {
    return;
  }

  if (isDuplicate(`${senderOf(m)}:${body}`)) {
    return reply(sock, m, card("DUPLICATE", "♻️ You already sent this request recently; the earlier request is being handled."));
  }

  if (["download","video","audio","image"].includes(command)) {
    const limit = isGroup(jid) ? config.groupDownloadsPerHour : config.userDownloadsPerHour;
    if (!allow(`download:${senderOf(m)}`, limit)) {
      return reply(sock, m, errorCard("Download rate limit reached. Please try again later."));
    }
  }

  try {
    switch (command) {
      case "menu":
      case "help":
        return reply(sock, m, menuCard());

      case "ping":
        return reply(sock, m, card("PING", "🏓 Pong!\\n⚡ BEAUTXIE AI is responding normally."));

      case "status": {
        const groups = sock.user ? Object.keys(await sock.groupFetchAllParticipating()).length : 0;
        return reply(sock, m, statusCard({
          connected: Boolean(sock.user),
          uptime: getUptime(),
          version: "1.0.0",
          groups,
          downloads: state.totalDownloads,
          queue: queueSize()
        }));
      }

      case "owner":
        return reply(sock, m, card("OWNER", `👑 Owner: +${config.ownerNumber || "not configured"}\\n📌 Contact the owner for administration.`));

      case "download":
      case "video":
      case "audio":
      case "image": {
        const url = args[0];
        if (!url) return reply(sock, m, errorCard(`Usage: ${prefix}${command} <url>`));
        const kind = command === "audio" ? "audio" : command === "image" ? "image" : "video";
        const direct = /\.(mp4|m4v|webm|mov|mp3|m4a|wav|jpg|jpeg|png|gif)(\?|$)/i.test(url);
        await reply(sock, m, card("MEDIA REQUEST", `🔎 Source detected\\n🔗 ${url}\\n⏳ Added to download queue...`));
        const result = await downloadMedia({ key: `${senderOf(m)}:${url}:${kind}`, url, kind, direct });
        const ext = path.extname(result.file).toLowerCase();
        const type = /^\.((jpg|jpeg|png|gif))$/.test(ext) ? "image" : kind === "audio" ? "audio" : "video";
        await sendMedia(jid, result.file, card("DOWNLOAD COMPLETE", `✅ ${result.title}\\n🌐 ${result.source}\\n📥 Ready to use.`), type);
        return;
      }

      case "info":
      case "formats":
        return reply(sock, m, card(command.toUpperCase(), "ℹ️ The source is handled by the media resolver.\\nUse /download, /video or /audio to request the media."));

      case "apps": {
        if (!args[0]) return reply(sock, m, errorCard(`Usage: ${prefix}apps <Play Store or Uptodown URL>`));
        const info = await inspectApp(args[0]);
        return reply(sock, m, card("APP SOURCE", [
          `📱 ${info.name}`,
          `🌐 ${info.source}`,
          info.developer ? `👨‍💻 ${info.developer}` : "",
          info.version ? `🔢 Version: ${info.version}` : "",
          info.downloadUrl ? `📥 APK: ${info.downloadUrl}` : "📥 Public APK URL not exposed by the source.",
          `🔗 ${info.url}`
        ].filter(Boolean).join("\\n")));
      }

      case "groupinfo": {
        if (!isGroup(jid)) return reply(sock, m, errorCard("This command is for groups."));
        const md = await groupMetadata(jid);
        return reply(sock, m, card("GROUP INFO", `👥 ${md.subject}\\n🧑 Members: ${md.participants.length}\\n👮 Admins: ${md.participants.filter(p => p.admin).length}`));
      }

      case "admins":
      case "tagadmins": {
        if (!isGroup(jid)) return reply(sock, m, errorCard("This command is for groups."));
        const md = await groupMetadata(jid);
        const mentions = md.participants.filter(p => p.admin).map(p => `@${numberOf(p.id)}`).join(" ");
        return reply(sock, m, card("GROUP ADMINS", mentions || "No administrators found."), md.participants.filter(p => p.admin).map(p => p.id));
      }

      case "rules": {
        if (!isGroup(jid)) return reply(sock, m, errorCard("This command is for groups."));
        return reply(sock, m, card("GROUP RULES", getGroup(jid).rules.replaceAll("\\n", "\n")));
      }

      case "setrules": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Admin permission required."));
        const g = getGroup(jid);
        g.rules = args.join(" ").replace(/\\n/g, "\n") || g.rules;
        await saveStore();
        return reply(sock, m, successCard("Group rules updated."));
      }

      case "welcome":
      case "goodbye": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Admin permission required."));
        const g = getGroup(jid);
        const value = args[0] !== "off";
        g[command] = value;
        await saveStore();
        return reply(sock, m, successCard(`${command} ${value ? "enabled" : "disabled"}.`));
      }

      case "antilink":
      case "antispam":
      case "antiflood": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Admin permission required."));
        const g = getGroup(jid);
        g[command] = args[0] !== "off";
        await saveStore();
        return reply(sock, m, successCard(`${command} ${g[command] ? "enabled" : "disabled"}.`));
      }

      case "promote":
      case "demote":
      case "kick":
      case "add":
      case "mute":
      case "unmute": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Group admin permission required."));
        const target = targetJid(m) || (args[0] && `${args[0].replace(/\D/g, "")}@s.whatsapp.net`);
        if (!target) return reply(sock, m, errorCard("Mention a member or provide a phone number."));
        const action = command === "promote" ? "promote" : command === "demote" ? "demote" : command === "kick" ? "remove" : command === "add" ? "add" : null;
        if (action) await sock.groupParticipantsUpdate(jid, [target], action);
        return reply(sock, m, successCard(`${command} completed for @${numberOf(target)}.`));
      }

      case "warn": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Group admin permission required."));
        const target = targetJid(m);
        if (!target) return reply(sock, m, errorCard("Mention the member to warn."));
        const g = getGroup(jid);
        const n = (g.warnings[target] || 0) + 1;
        g.warnings[target] = n;
        await saveStore();
        const action = n >= config.warnLimit ? "Warning threshold reached; admin review is required." : `${n}/${config.warnLimit} warnings.`;
        return sock.sendMessage(jid, { text: card("WARNING", `⚠️ @${numberOf(target)}\\n📋 ${args.slice(1).join(" ") || "Group rule violation"}\\n${action}`), mentions: [target] }, { quoted: m });
      }

      case "warnings":
      case "resetwarn": {
        if (!(isOwner(m) || await groupAdmin(sock, m))) return reply(sock, m, errorCard("Group admin permission required."));
        const target = targetJid(m);
        if (!target) return reply(sock, m, errorCard("Mention the member."));
        const g = getGroup(jid);
        if (command === "resetwarn") g.warnings[target] = 0;
        await saveStore();
        return reply(sock, m, card("WARNINGS", `@${numberOf(target)} has ${g.warnings[target] || 0} warning(s).`));
      }

      case "bot": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        state.botEnabled = args[0] !== "off";
        await saveStore();
        return reply(sock, m, successCard(`Bot is now ${state.botEnabled ? "ON" : "OFF"}.`));
      }

      case "setbotname": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        state.botName = args.join(" ") || config.botName;
        await saveStore();
        return reply(sock, m, successCard(`Bot name changed to ${state.botName}.`));
      }

      case "setdescription": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        state.description = args.join(" ");
        await saveStore();
        return reply(sock, m, successCard("Bot description updated."));
      }

      case "setprefix": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        state.prefix = args[0] || "/";
        await saveStore();
        return reply(sock, m, successCard(`Command prefix: ${state.prefix}`));
      }

      case "setgrouplink": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        state.groupLink = args[0] || "";
        await saveStore();
        return reply(sock, m, successCard("Group link updated and will be attached to branded cards."));
      }

      case "setpairgroup": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        const supplied = args.join(" ").trim();
        try {
          const resolved = supplied ? await resolveGroupInvite(supplied) : await resolveGroupInvite(config.groupLink);
          if (!resolved.jid || !resolved.jid.endsWith("@g.us")) throw new Error("The invite does not resolve to a WhatsApp group.");
          state.pairGroup = resolved.jid;
          await saveStore();
          return reply(sock, m, successCard(`Pairing/control group set successfully.\n\nGroup: ${resolved.subject || resolved.jid}\n\nThe bot will use the group link/JID internally; you do not need to enter the JID manually.`));
        } catch (e) {
          return reply(sock, m, errorCard(`Could not resolve the group invite. Make sure the bot can access the group and the link is valid.\n\nError: ${e.message}`));
        }
      }

      case "pair": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        if (!requirePairGroup(m)) return reply(sock, m, errorCard("Pairing commands are restricted to the dedicated pairing group."));
        const n = args[0] || config.pairingNumber;
        if (!n) return reply(sock, m, errorCard("Provide a phone number with country code."));
        const code = await requestPairingCode(n);
        return reply(sock, m, card("PAIRING", `🔐 Pairing code: *${code}*\\nOpen WhatsApp → Linked Devices → Link a device → Link with phone number instead.`));
      }

      case "unpair":
        if (isOwner(m)) return reply(sock, m, card("SESSION", "Use WhatsApp Linked Devices to unlink this session, then remove the stored auth directory if a full reset is required."));
        return reply(sock, m, errorCard("Owner only."));

      case "session":
      case "sessions":
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        return reply(sock, m, card("SESSIONS", `🟢 Current session: ${sock.user?.id || "not connected"}\\n📁 Auth storage: persistent`));

      case "setbotimage": {
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        const img = m.message?.imageMessage;
        if (!img) return reply(sock, m, errorCard("Send an image with /setbotimage as the caption."));
        const data = await (await import("@whiskeysockets/baileys")).downloadContentFromMessage(img, "image");
        const chunks = [];
        for await (const c of data) chunks.push(c);
        await fs.writeFile(config.botImagePath, Buffer.concat(chunks));
        try { await updateProfilePicture(sock.user.id, config.botImagePath); } catch (e) { console.error("profile picture update:", e); }
        return reply(sock, m, successCard("Owner bot image saved."));
      }

      case "stats":
        if (!isOwner(m)) return reply(sock, m, errorCard("Owner only."));
        return reply(sock, m, card("STATISTICS", `📥 Total downloads: ${state.totalDownloads}\\n📦 Queue: ${queueSize()}`));

      default:
        return reply(sock, m, errorCard(`Unknown command. Use ${prefix}menu.`));
    }
  } catch (e) {
    console.error(e);
    return reply(sock, m, errorCard(e.message || "Something went wrong."));
  }
}

const welcomeQueues = new Map();
const welcomeTimers = new Map();
const welcomeCooldowns = new Map();

export async function handleGroupParticipants(sock, event) {
  const g = getGroup(event.id);
  const participants = [...new Set(event.participants || [])];
  if (!participants.length) return;

  if (event.action === "add" && g.welcome) {
    const existing = welcomeQueues.get(event.id) || new Set();
    for (const participant of participants) existing.add(participant);
    welcomeQueues.set(event.id, existing);

    if (!welcomeTimers.has(event.id)) {
      const timer = setTimeout(() => flushWelcome(sock, event.id), config.welcomeBundleDelayMs);
      welcomeTimers.set(event.id, timer);
    }
  }

  if ((event.action === "remove" || event.action === "leave") && g.goodbye) {
    const tags = participants.map(numberOf).map(n => `@${n}`).join(" ");
    await sendBrandedCard(event.id, card("GOODBYE", stateMessage(getState().goodbyeMessages, tags)), { mentions: participants });
  }
}

async function flushWelcome(sock, jid) {
  welcomeTimers.delete(jid);
  const queue = welcomeQueues.get(jid);
  welcomeQueues.delete(jid);
  if (!queue?.size) return;

  const group = getGroup(jid);
  const now = Date.now();
  const memberCooldown = config.welcomeMemberCooldownHours * 60 * 60 * 1000;
  const eligible = [...queue].filter(member => {
    const last = Number(group.welcomeHistory?.[member] || 0);
    return !last || now - last >= memberCooldown;
  });
  if (!eligible.length) return;

  const members = eligible.slice(0, config.maxWelcomeBatch);
  const overflow = eligible.slice(config.maxWelcomeBatch);
  if (overflow.length) {
    const again = new Set(overflow);
    welcomeQueues.set(jid, again);
    const timer = setTimeout(() => flushWelcome(sock, jid), config.welcomeBundleDelayMs);
    welcomeTimers.set(jid, timer);
  }

  const cooldownUntil = welcomeCooldowns.get(jid) || 0;
  if (cooldownUntil > now) {
    const delay = cooldownUntil - now;
    for (const member of members) {
      const q = welcomeQueues.get(jid) || new Set();
      q.add(member);
      welcomeQueues.set(jid, q);
    }
    const timer = setTimeout(() => flushWelcome(sock, jid), delay);
    if (welcomeTimers.has(jid)) clearTimeout(welcomeTimers.get(jid));
    welcomeTimers.set(jid, timer);
    return;
  }

  const tags = members.map(numberOf).map(n => `@${n}`).join(" ");
  const countText = members.length === 1 ? "new member" : `${members.length} new members`;
  const msg = stateMessage(getState().welcomeMessages, tags);
  await sendBrandedCard(jid, card("WELCOME", `👋 ${countText} bundled together.\n${msg}`), { mentions: members });
  group.welcomeHistory ??= {};
  for (const member of members) group.welcomeHistory[member] = Date.now();
  await saveStore();
  welcomeCooldowns.set(jid, Date.now() + config.welcomeCooldownMs);
}

function stateMessage(list, tags) {
  return (list[Math.floor(Math.random() * list.length)] || "Welcome @users!").replaceAll("@users", tags).replaceAll("@user", tags);
}
