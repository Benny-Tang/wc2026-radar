/**
 * WC2026 Social Media Scraper
 * Powered by Bright Data Social Media Scraper API
 * Runs in GitHub Actions → outputs results.json → served via GitHub Pages
 * Targets: Telegram, X (Twitter), WeChat, Xiaohongshu, Facebook
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Load .env for local runs (GitHub Actions uses repo secret directly)
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
const BRIGHT_DATA_BASE_URL = "https://api.brightdata.com";

if (!BRIGHT_DATA_API_KEY) {
  console.error("❌ BRIGHT_DATA_API_KEY not set");
  process.exit(1);
}

// ─── DATASET IDs (Bright Data Social Media Scrapers) ─────────────────────────
const DATASET_IDS = {
  twitter_hashtag:  "gd_lwxkxvnf1cynvib9co",
  facebook_posts:   "gd_l1vijqt9jfj9b31sf",
  tiktok_hashtag:   "gd_l7q7dkf244hwjntr0",
};

// ─── HASHTAGS ─────────────────────────────────────────────────────────────────
const ALL_HASHTAGS = [
  "#WC2026", "#WorldCup2026", "#AsianHandicap", "#footballtips", "#FIFA2026",
  "#世界杯2026", "#足球预测", "#亚盘", "#竞彩", "#让球",
  "#PialaDunia2026", "#bolatipster",
  "#WC2026亚盘", "#世界杯tips",
];

// ─── BRIGHT DATA CLIENT ───────────────────────────────────────────────────────
class BrightDataClient {
  constructor(apiKey) {
    this.client = axios.create({
      baseURL: BRIGHT_DATA_BASE_URL,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120000,
    });
  }

  async triggerCollection(datasetId, inputs) {
    console.log(`🚀 Triggering dataset ${datasetId} with ${inputs.length} inputs`);
    const res = await this.client.post(
      `/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`,
      inputs
    );
    const snapshotId = res.data?.snapshot_id;
    console.log(`   Snapshot ID: ${snapshotId}`);
    return snapshotId;
  }

  async waitForSnapshot(snapshotId, maxWaitMs = 300000) {
    console.log(`⏳ Waiting for snapshot ${snapshotId}...`);
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await this.client.get(`/datasets/v3/progress/${snapshotId}`);
      const { status, total_rows } = res.data;
      console.log(`   ${status} | rows: ${total_rows ?? "?"}`);
      if (status === "ready") return res.data;
      if (status === "failed") throw new Error(`Snapshot failed: ${JSON.stringify(res.data)}`);
      await new Promise(r => setTimeout(r, 12000));
    }
    throw new Error("Snapshot timed out");
  }

  async downloadSnapshot(snapshotId) {
    const res = await this.client.get(`/datasets/v3/snapshot/${snapshotId}`, {
      params: { format: "json" },
    });
    const rows = Array.isArray(res.data) ? res.data : [res.data];
    console.log(`   ✅ Downloaded ${rows.length} rows`);
    return rows;
  }

  async serpSearch(query) {
    console.log(`🔍 SERP: "${query}"`);
    const res = await this.client.post("/serp/v1/search", {
      engine: "google", query, country: "MY", language: "zh-CN", num: 10,
    });
    return res.data?.organic_results || [];
  }

  async webUnlock(url, country = "SG") {
    const res = await this.client.post("/unblock/v1", {
      url, country, format: "raw_html",
    });
    return res.data || "";
  }
}

// ─── PLATFORM SCRAPERS ────────────────────────────────────────────────────────

async function scrapeTwitter(client) {
  console.log("\n🐦 Scraping X (Twitter)...");
  const inputs = ALL_HASHTAGS.slice(0, 10).map(tag => ({
    url: `https://twitter.com/search?q=${encodeURIComponent(tag)}&src=typed_query&f=live`,
  }));
  try {
    const snapId = await client.triggerCollection(DATASET_IDS.twitter_hashtag, inputs);
    await client.waitForSnapshot(snapId);
    const rows = await client.downloadSnapshot(snapId);
    return rows.map(r => ({
      platform: "X (Twitter)",
      username: r.user?.screen_name || "",
      display_name: r.user?.name || "",
      followers: r.user?.followers_count || 0,
      bio: r.user?.description || "",
      post_text: r.text || r.full_text || "",
      post_date: r.created_at || "",
      engagement: (r.retweet_count || 0) + (r.favorite_count || 0),
      hashtags_found: ALL_HASHTAGS.filter(h =>
        (r.text || "").toLowerCase().includes(h.replace("#","").toLowerCase())),
      profile_url: r.user?.screen_name ? `https://twitter.com/${r.user.screen_name}` : "",
      telegram_in_bio: extractTelegramLink(r.user?.description || ""),
      location: r.user?.location || "",
    }));
  } catch (err) {
    console.error(`❌ Twitter: ${err.message}`);
    return [];
  }
}

async function scrapeFacebook(client) {
  console.log("\n📘 Scraping Facebook...");
  const inputs = ALL_HASHTAGS.slice(0, 8).map(tag => ({
    url: `https://www.facebook.com/hashtag/${tag.replace("#","").replace(/\s/g,"_")}`,
  }));
  try {
    const snapId = await client.triggerCollection(DATASET_IDS.facebook_posts, inputs);
    await client.waitForSnapshot(snapId);
    const rows = await client.downloadSnapshot(snapId);
    return rows.map(r => ({
      platform: "Facebook",
      username: r.user_id || r.page_id || "",
      display_name: r.page_name || r.user_name || "",
      followers: r.page_likes || r.followers || 0,
      bio: r.page_description || r.about || "",
      post_text: r.post_text || r.message || "",
      post_date: r.date_posted || r.created_time || "",
      engagement: (r.reactions_count||0)+(r.comments_count||0)+(r.shares_count||0),
      hashtags_found: ALL_HASHTAGS.filter(h =>
        (r.post_text||"").toLowerCase().includes(h.replace("#","").toLowerCase())),
      profile_url: r.page_url || r.post_url || "",
      telegram_in_bio: extractTelegramLink(r.page_description || r.about || ""),
      location: r.location || "",
    }));
  } catch (err) {
    console.error(`❌ Facebook: ${err.message}`);
    return [];
  }
}

async function scrapeTelegram(client) {
  console.log("\n✈️  Scraping Telegram via SERP...");
  const queries = [
    'WC2026 Asian Handicap predictions site:t.me',
    '世界杯2026 竞彩预测 telegram',
    'football tips Malaysia 2026 site:t.me',
    '亚盘推荐 世界杯 群组 telegram',
    '"World Cup 2026" tipster channel t.me',
  ];
  const results = [];
  for (const query of queries) {
    try {
      const serpResults = await client.serpSearch(query);
      serpResults.forEach(r => {
        if (r.link?.includes("t.me")) {
          results.push({
            platform: "Telegram",
            username: extractTelegramUsername(r.link),
            display_name: r.title || "",
            followers: 0,
            bio: r.snippet || "",
            post_text: r.snippet || "",
            post_date: "",
            engagement: 0,
            hashtags_found: [],
            profile_url: r.link,
            telegram_in_bio: r.link,
            location: "",
          });
        }
      });
    } catch (err) {
      console.error(`❌ Telegram SERP "${query}": ${err.message}`);
    }
  }
  console.log(`   ✅ Found ${results.length} Telegram channels`);
  return results;
}

async function scrapeXiaohongshu(client) {
  console.log("\n📕 Scraping Xiaohongshu via SERP...");
  const queries = ["世界杯2026 竞彩 site:xiaohongshu.com", "足球预测 亚盘 小红书 WC2026"];
  const results = [];
  for (const query of queries) {
    try {
      const serpResults = await client.serpSearch(query);
      serpResults.forEach(r => {
        results.push({
          platform: "Xiaohongshu (小红书)",
          username: extractXhsUsername(r.link),
          display_name: r.title || "",
          followers: 0,
          bio: r.snippet || "",
          post_text: r.snippet || "",
          post_date: "",
          engagement: 0,
          hashtags_found: [],
          profile_url: r.link,
          telegram_in_bio: extractTelegramLink(r.snippet || ""),
          location: "China",
        });
      });
    } catch (err) {
      console.error(`❌ XHS: ${err.message}`);
    }
  }
  console.log(`   ✅ Found ${results.length} XHS results`);
  return results;
}

async function scrapeWeChat(client) {
  console.log("\n💬 Scraping WeChat via Sogou...");
  const terms = ["世界杯2026 竞彩", "WC2026 足球预测", "亚盘 推荐 世界杯"];
  const results = [];
  for (const term of terms) {
    try {
      const html = await client.webUnlock(
        `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(term)}&ie=utf8`,
        "SG"
      );
      const parsed = parseSogouHTML(html, term);
      results.push(...parsed);
    } catch (err) {
      // Fallback to SERP
      try {
        const serpResults = await client.serpSearch(`site:mp.weixin.qq.com ${term}`);
        serpResults.forEach(r => {
          results.push({
            platform: "WeChat (微信)",
            username: r.link?.match(/(?:\/s\/)([A-Za-z0-9_-]+)/)?.[1] || "",
            display_name: r.title || "",
            followers: 0,
            bio: r.snippet || "",
            post_text: r.snippet || "",
            post_date: "",
            engagement: 0,
            hashtags_found: [],
            profile_url: r.link,
            telegram_in_bio: "",
            location: "China",
          });
        });
      } catch (e2) {
        console.error(`❌ WeChat: ${e2.message}`);
      }
    }
  }
  console.log(`   ✅ Found ${results.length} WeChat results`);
  return results;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseSogouHTML(html, keyword) {
  const results = [];
  const blockRe = /<div class="txt-box">([\s\S]*?)<\/div>/g;
  const titleRe = /<h3[^>]*><a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a><\/h3>/;
  const accountRe = /class="account"[^>]*>(.*?)<\/span>/;
  const snippetRe = /<p[^>]*class="txt-info[^"]*">(.*?)<\/p>/;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const b = m[1];
    const tM = titleRe.exec(b);
    const aM = accountRe.exec(b);
    const sM = snippetRe.exec(b);
    if (tM) results.push({
      platform: "WeChat (微信)",
      username: aM ? aM[1].replace(/<[^>]+>/g,"").trim() : "",
      display_name: aM ? aM[1].replace(/<[^>]+>/g,"").trim() : "",
      followers: 0, bio: sM ? sM[1].replace(/<[^>]+>/g,"").trim() : "",
      post_text: tM[2] ? tM[2].replace(/<[^>]+>/g,"").trim() : "",
      post_date: "", engagement: 0,
      hashtags_found: [keyword], profile_url: tM[1] || "",
      telegram_in_bio: "", location: "China",
    });
  }
  return results;
}

function extractTelegramLink(text) {
  const m = text?.match(/(?:https?:\/\/)?t\.me\/[A-Za-z0-9_]+/);
  return m ? m[0] : "";
}
function extractTelegramUsername(url) {
  const m = url?.match(/t\.me\/([A-Za-z0-9_]+)/);
  return m ? `@${m[1]}` : url;
}
function extractXhsUsername(url) {
  const m = url?.match(/user\/profile\/([A-Za-z0-9]+)/);
  return m ? m[1] : url;
}

// ─── SCORING ──────────────────────────────────────────────────────────────────

function scoreAndFilter(all) {
  const KEYWORDS = ["tipster","预测","竞彩","亚盘","让球","足球","football",
    "betting","odds","handicap","tips","telegram","频道","群"];

  const seen = new Set();
  return all
    .map(item => {
      let score = 0;
      const text = `${item.bio} ${item.post_text} ${item.display_name}`.toLowerCase();
      if (item.followers > 100000) score += 50;
      else if (item.followers > 10000) score += 30;
      else if (item.followers > 1000)  score += 15;
      else if (item.followers > 100)   score += 5;
      KEYWORDS.forEach(kw => { if (text.includes(kw)) score += 5; });
      if (item.telegram_in_bio) score += 25;
      if (item.engagement > 1000) score += 20;
      else if (item.engagement > 100) score += 10;
      if (item.platform === "Telegram") score += 15;
      if (item.platform === "WeChat (微信)") score += 10;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter(item => {
      const key = `${item.platform}::${item.username}`;
      if (seen.has(key) || !item.username) return false;
      seen.add(key);
      return true;
    });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  WC2026 Tipster Radar — Scrape Run        ║");
  console.log(`║  ${new Date().toISOString()}     ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  const client = new BrightDataClient(BRIGHT_DATA_API_KEY);

  const [twRes, fbRes] = await Promise.allSettled([
    scrapeTwitter(client),
    scrapeFacebook(client),
  ]);

  const tgRes  = await scrapeTelegram(client);
  const xhsRes = await scrapeXiaohongshu(client);
  const wxRes  = await scrapeWeChat(client);

  const raw = [
    ...(twRes.status  === "fulfilled" ? twRes.value  : []),
    ...(fbRes.status  === "fulfilled" ? fbRes.value  : []),
    ...tgRes, ...xhsRes, ...wxRes,
  ];

  console.log(`\n📈 Raw results: ${raw.length}`);
  const scored = scoreAndFilter(raw);

  const tier1 = scored.filter(i => i.score >= 50);
  const tier2 = scored.filter(i => i.score >= 25 && i.score < 50);
  const tier3 = scored.filter(i => i.score < 25);

  console.log(`   🥇 Tier 1: ${tier1.length}`);
  console.log(`   🥈 Tier 2: ${tier2.length}`);
  console.log(`   🥉 Tier 3: ${tier3.length}`);

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
    tier1, tier2, tier3,
    all: scored,
  };

  // Write to docs/ so GitHub Pages can serve it
  const outDir = path.join(__dirname, "../docs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(output, null, 2));
  console.log(`\n💾 Written to docs/results.json`);

  // Also write a timestamped archive
  const archiveDir = path.join(outDir, "archive");
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const ts = new Date().toISOString().slice(0,16).replace(/[T:]/g,"-");
  fs.writeFileSync(path.join(archiveDir, `results_${ts}.json`), JSON.stringify(output));
  console.log(`💾 Archive: docs/archive/results_${ts}.json`);

  console.log("\n✅ Done. GitHub Actions will commit & push to Pages.");
}

main().catch(err => {
  console.error("\n💥", err.message);
  process.exit(1);
});
