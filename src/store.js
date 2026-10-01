import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const file = path.join(config.dataDir, "state.json");
const defaults = {
  botEnabled: true,
  botName: config.botName,
  description: config.description,
  prefix: config.prefix,
  groupLink: config.groupLink,
  channelLink: config.channelLink,
  owners: config.ownerNumber ? [config.ownerNumber] : [],
  pairGroup: config.pairingGroupJid,
  groups: {},
  userStats: {},
  totalDownloads: 0,
  welcomeMessages: [
    "👋 Welcome @users! You’re now part of the BEAUTXIE AI community. Please check the group rules and settle in.",
    "🎉 A warm welcome to @users! Glad to have you with us. Take a moment to read the rules.",
    "💚 Welcome @users! Make yourself comfortable, respect the community, and enjoy your time here.",
    "✨ New members have arrived: @users! Welcome to the community — we’re happy to have you here."
  ],
  goodbyeMessages: [
    "👋 @user has left the group. Take care!",
    "💚 Goodbye @user. We wish you well."
  ]
};

let state = structuredClone(defaults);

export async function initStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.downloadDir, { recursive: true });
  await fs.mkdir(config.tempDir, { recursive: true });
  await fs.mkdir(config.authDir, { recursive: true });
  await fs.mkdir(config.logDir, { recursive: true });
  try {
    state = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    await saveStore();
  }
}

export async function saveStore() {
  await fs.writeFile(file, JSON.stringify(state, null, 2));
}

export function getState() { return state; }
export function getGroup(jid) {
  state.groups[jid] ??= {
    welcome: config.autoWelcome,
    goodbye: config.autoGoodbye,
    antiLink: config.antiLink,
    antiSpam: config.antiSpam,
    antiFlood: config.antiFlood,
    rules: "1. Respect everyone.\\n2. No spam.\\n3. No unwanted links.\\n4. Follow admin instructions.",
    warnings: {},
    description: "",
    welcomeHistory: {}
  };
  return state.groups[jid];
}
export async function updateState(mutator) {
  await mutator(state);
  await saveStore();
}
