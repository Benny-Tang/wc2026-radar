/**
 * WC2026 Social Media Scraper
 * Powered by Bright Data SERP API (zone: serp_api)
 * Runs in GitHub Actions → outputs results.json → served via GitHub Pages
 * Targets: Telegram, X (Twitter), WeChat, Xiaohongshu, Facebook
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join("=").trim();
    }
  });
}

const BRIGHT_DATA_API_KEY = process.env.BRIGHT_DATA_API_KEY;
const SERP_ZONE = process.env.BD_SERP_ZONE || "serp_api";
const BRIGHT_DATA_BASE_URL = "https://api.brightdata.com";

if (!BRIGHT_DATA_API_KEY) {
  console.error("BRIGHT_DATA_API_KEY not set");
  process.exit(1);
}

const SEARCH_QUERIES = {
  telegram: [
    'site:t.me WC2026 Asian Handicap predictions',
    'site:t.me 世界杯2026 竞彩 预测',
    'site:t.me football tips Malaysia 2026',
    'site:t.me 亚盘 推荐 世界杯',
    'site:t.me "World Cup 2026" tipster channel',
    'site:t.me bolatipster taruhan2026',
  ],
  twitter: [
    'site:twitter.com OR site:x.com #WC2026 #AsianHandicap',
    'site:twitter.com OR site:x.com 世界杯2026 竞彩 亚盘',
    'site:twitter.com OR site:x.com WC2026 footballtips',
  ],
  facebook: [
    'site:facebook.com WC2026 Asian Handicap tips group',
    'site:facebook.com 世界杯2026 竞彩 让球 群组',
    'site:facebook.com PialaDunia2026 bolatipster',
  ],
  xiaohongshu: [
    'site:xiaohongshu.com 世界杯2026 竞彩 预测',
    'site:xiaohongshu.com 足球 亚盘 WC2026',
  ],
  wechat: [
    'site:mp.weixin.qq.com 世界杯2026 竞彩',
    'site:mp.weixin.qq.com WC2026 足球预测 亚盘',
  ],
};

class BrightDataSERP {
  constructor(apiKey, zone) {
    this.apiKey = apiKey;
    this.zone = zone;
    this.client = axios.create({
      baseURL: BRIGHT_DATA_BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
  }

  async search(query, retries = 2) {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&brd_json=1`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await this.client.post("/request", {
          zone: this.zone,
          url: googleUrl,
          format: "raw",
        });

        let data = res.data;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch (e) {}
        }

        const organic = (data && (data.organic || data.organic_results)) || [];
        console.log(`   OK "${query}" -> ${organic.length} results`);
        return organic;
      } catch (err) {
        const status = err.response && err.response.status;
        const msg = err.response ? err.response.data : err.message;
        console.error(`   FAIL ${attempt}/${retries} "${query}": ${status} ${JSON.stringify(msg).slice(0,200)}`);
        if (attempt === retries) return [];
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    return [];
  }
}

function processResult(item, platform, query) {
  const link = item.link || item.url || "";
  const title = item.title || "";
  const snippet = item.description || item.snippet || "";

  return {
    platform: platformLabel(platform),
    username: extractUsername(link, platform),
    display_name: title,
    followers: 0,
    bio: snippet,
    post_text: snippet,
    post_date: "",
    engagement: 0,
    hashtags_found: extractHashtags(query),
    profile_url: link,
    telegram_in_bio: extractTelegramLink(snippet) || (link.includes("t.me") ? link : ""),
    location: (platform === "xiaohongshu" || platform === "wechat") ? "China" : "",
    search_query: query,
  };
}

function platformLabel(p) {
  const labels = {
    telegram: "Telegram",
    twitter: "X (Twitter)",
    facebook: "Facebook",
    xiaohongshu: "Xiaohongshu (小红书)",
    wechat: "WeChat (微信)",
  };
  return labels[p] || p;
}

function extractUsername(url, platform) {
  url = url || "";
  if (platform === "telegram") {
    const m = url.match(/t\.me\/([A-Za-z0-9_]+)/);
    return m ? "@" + m[1] : url;
  }
  if (platform === "twitter") {
    const m = url.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/);
    return m ? "@" + m[1] : url;
  }
  if (platform === "facebook") {
    const m = url.match(/facebook\.com\/([A-Za-z0-9_.\-]+)/);
    return m ? m[1] : url;
  }
  if (platform === "xiaohongshu") {
    const m = url.match(/(?:user\/profile\/|item\/)([A-Za-z0-9]+)/);
    return m ? m[1] : url;
  }
  if (platform === "wechat") {
    const m = url.match(/\/s\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : url;
  }
  return url;
}

function extractHashtags(query) {
  const tags = query.match(/#[\p{L}\p{N}_]+/gu) || [];
  return tags;
}

function extractTelegramLink(text) {
  text = text || "";
  const m = text.match(/(?:https?:\/\/)?t\.me\/[A-Za-z0-9_]+/);
  return m ? m[0] : "";
}

function scoreAndFilter(all) {
  const KEYWORDS = ["tipster","预测","竞彩","亚盘","让球","足球","football",
    "betting","odds","handicap","tips","telegram","频道","群","tip","bola"];

  const seen = new Set();
  return all
    .map(item => {
      let score = 0;
      const text = (item.bio + " " + item.post_text + " " + item.display_name).toLowerCase();

      KEYWORDS.forEach(kw => { if (text.includes(kw)) score += 5; });
      if (item.telegram_in_bio) score += 25;
      if (item.platform === "Telegram") score += 15;
      if (item.platform === "WeChat (微信)") score += 10;
      if (item.hashtags_found && item.hashtags_found.length) score += item.hashtags_found.length * 3;

      return Object.assign({}, item, { score: score });
    })
    .sort((a, b) => b.score - a.score)
    .filter(item => {
      const key = item.platform + "::" + item.profile_url;
      if (seen.has(key) || !item.profile_url) return false;
      seen.add(key);
      return true;
    });
}

async function main() {
  console.log("WC2026 Tipster Radar - Scrape Run");
  console.log(new Date().toISOString());
  console.log("SERP Zone: " + SERP_ZONE);

  const client = new BrightDataSERP(BRIGHT_DATA_API_KEY, SERP_ZONE);
  const allResults = [];

  for (const platform of Object.keys(SEARCH_QUERIES)) {
    const queries = SEARCH_QUERIES[platform];
    console.log("\n" + platformLabel(platform) + "...");
    for (const query of queries) {
      const organic = await client.search(query);
      organic.forEach(item => allResults.push(processResult(item, platform, query)));
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("\nRaw results: " + allResults.length);
  const scored = scoreAndFilter(allResults);

  const tier1 = scored.filter(i => i.score >= 30);
  const tier2 = scored.filter(i => i.score >= 15 && i.score < 30);
  const tier3 = scored.filter(i => i.score < 15);

  console.log("Tier 1: " + tier1.length);
  console.log("Tier 2: " + tier2.length);
  console.log("Tier 3: " + tier3.length);

  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total: scored.length,
      tier1: tier1.length,
      tier2: tier2.length,
      tier3: tier3.length,
      with_telegram: scored.filter(i => i.telegram_in_bio).length,
      by_platform: scored.reduce((acc, r) => {
        acc[r.platform] = (acc[r.platform] || 0) + 1; return acc;
      }, {}),
    },
    tier1: tier1, tier2: tier2, tier3: tier3,
    all: scored,
  };

  const outDir = path.join(__dirname, "../docs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(output, null, 2));
  console.log("\nWritten to docs/results.json");

  const archiveDir = path.join(outDir, "archive");
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const ts = new Date().toISOString().slice(0,16).replace(/[T:]/g,"-");
  fs.writeFileSync(path.join(archiveDir, "results_" + ts + ".json"), JSON.stringify(output));
  console.log("Archive: docs/archive/results_" + ts + ".json");

  console.log("\nDone.");
}

main().catch(err => {
  console.error("Fatal: " + err.message);
  process.exit(1);
});
