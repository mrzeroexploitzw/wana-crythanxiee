import express from "express";
import fs from "node:fs";
import { config } from "./config.js";
import { initStore } from "./store.js";
import { startWhatsApp } from "./whatsapp.js";
import { cleanupDownloads } from "./downloader.js";

await initStore();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.json({
  name: config.botName,
  status: "running",
  description: config.description
}));

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: config.botName,
  uptime: process.uptime()
}));

app.get("/api/owner/pair", async (req, res) => {
  if (!config.ownerToken || req.query.token !== config.ownerToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const number = String(req.query.number || config.pairingNumber).replace(/\D/g, "");
  if (!number) return res.status(400).json({ error: "Missing number" });
  try {
    const { requestPairingCode } = await import("./whatsapp.js");
    const code = await requestPairingCode(number);
    res.json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`${config.botName} web service listening on ${config.port}`);
});

await startWhatsApp();

setInterval(() => cleanupDownloads().catch(console.error), 10 * 60 * 1000);
await cleanupDownloads();
