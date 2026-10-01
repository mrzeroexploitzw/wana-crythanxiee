import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import axios from "axios";
import sanitize from "sanitize-filename";
import mime from "mime-types";
import { config } from "./config.js";
import { getState, saveStore } from "./store.js";

const active = new Map();
const queue = [];
let running = 0;

function run(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("Downloader timeout"));
    }, timeoutMs);
    p.stdout.on("data", d => stdout += d);
    p.stderr.on("data", d => stderr += d);
    p.on("error", reject);
    p.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.slice(-2000) || `Process exited ${code}`));
    });
  });
}

async function processJob(job) {
  running++;
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const out = path.join(config.downloadDir, `${id}.%(ext)s`);
    let result;
    if (job.direct) {
      const response = await axios.get(job.url, {
        responseType: "arraybuffer",
        maxContentLength: config.maxDownloadMB * 1024 * 1024,
        maxBodyLength: config.maxDownloadMB * 1024 * 1024,
        timeout: 120000,
        headers: { "User-Agent": "BEAUTXIE-AI/1.0" }
      });
      const type = response.headers["content-type"] || "";
      if (!/^((video|audio|image)\/|application\/pdf)/i.test(type)) {
        throw new Error("Direct URL did not return supported media.");
      }
      const ext = mime.extension(type.split(";")[0]) || "bin";
      const filename = sanitize(`${id}.${ext}`) || `${id}.bin`;
      const target = path.join(config.downloadDir, filename);
      await fs.writeFile(target, response.data);
      result = { file: target, title: filename, source: "Direct URL" };
    } else {
      const format = job.kind === "audio" ? "bestaudio/best" : "best[ext=mp4]/best";
      const args = [
        "--no-playlist", "--restrict-filenames", "--no-warnings",
        "--max-filesize", `${config.maxDownloadMB}M`,
        "-f", format,
        "-o", out,
        job.url
      ];
      if (job.kind === "audio") args.push("-x", "--audio-format", "mp3");
      await run(config.ytDlpPath, args);
      const files = (await fs.readdir(config.downloadDir))
        .filter(x => x.startsWith(id + "."))
        .map(x => path.join(config.downloadDir, x));
      if (!files.length) throw new Error("Downloader finished without producing a file.");
      result = { file: files[0], title: path.basename(files[0]), source: "Public media source" };
    }
    getState().totalDownloads++;
    await saveStore();
    job.resolve(result);
    return result;
  } catch (error) {
    job.reject(error);
    throw error;
  } finally {
    running--;
    active.delete(job.key);
    pump();
  }
}

function pump() {
  while (running < config.maxConcurrentDownloads && queue.length) {
    processJob(queue.shift()).catch(() => {});
  }
}

export function downloadMedia(job) {
  if (active.has(job.key)) return active.get(job.key);
  const promise = new Promise((resolve, reject) => {
    job.resolve = resolve; job.reject = reject;
    queue.push(job);
    active.set(job.key, promise);
    pump();
  });
  return promise;
}

export function queueSize() { return queue.length + running; }

export async function cleanupDownloads() {
  const cutoff = Date.now() - config.downloadTtlMinutes * 60 * 1000;
  for (const dir of [config.downloadDir, config.tempDir]) {
    try {
      for (const name of await fs.readdir(dir)) {
        const p = path.join(dir, name);
        const st = await fs.stat(p);
        if (st.mtimeMs < cutoff) await fs.rm(p, { recursive: true, force: true });
      }
    } catch {}
  }
}
