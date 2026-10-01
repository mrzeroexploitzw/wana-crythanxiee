import axios from "axios";
import * as cheerio from "cheerio";
import gplay from "google-play-scraper";

export async function inspectApp(url) {
  if (/play\.google\.com\/store\/apps/i.test(url)) {
    const id = new URL(url).searchParams.get("id");
    if (!id) throw new Error("Play Store URL has no package id.");
    const app = await gplay.app({ appId: id });
    return {
      source: "Google Play Store",
      name: app.title,
      developer: app.developer,
      version: app.version || "N/A",
      size: app.size || "N/A",
      rating: app.score ?? "N/A",
      installs: app.installs || "N/A",
      url
    };
  }

  if (/uptodown\.com/i.test(url)) {
    const html = (await axios.get(url, {
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0" }
    })).data;
    const $ = cheerio.load(html);
    const title = $("h1").first().text().trim() || $("title").text().trim();
    const links = $("a").map((_, a) => $(a).attr("href")).get()
      .filter(x => x && /download/i.test(x));
    const apk = links.find(x => /\.apk(\?|$)/i.test(x)) || null;
    return {
      source: "Uptodown",
      name: title || "Uptodown app",
      downloadUrl: apk ? new URL(apk, url).href : null,
      url
    };
  }

  throw new Error("Unsupported app source.");
}
