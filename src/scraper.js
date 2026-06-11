/**
 * WC2026 Social Media Scraper v2
 * Powered by Bright Data: SERP API + Web Unlocker + Social Scraper API
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

const TWITTER_PROFILE_DATASET = "gd_lwxmeb2u1cniijd7t4";

const SEARCH_QUERIES = {
  telegram: [
    "site:t.me WC2026 Asian Handicap predictions",
    "site:t.me 世界杯2026 竞彩 预测",
    "site:t.me football tips Malaysia 2026",
    "site:t.me 亚盘 推荐 世界杯",
    "site:t.me World Cup 2026 tipster channel",
    "site:t.me bolatipster taruhan2026",
  ],
  twitter: [
    "site:twitter.com OR site:x.com #WC2026 #AsianHandicap",
    "site:twitter.com OR site:x.com 世界杯2026 竞彩 亚盘",
    "site:twitter.com OR site:x.com WC2026 footballtips",
  ],
  facebook: [
    "site:facebook.com WC2026 Asian Handicap tips group",
    "site:facebook.com 世界杯2026 竞彩 让球 群组",
    "site:facebook.com PialaDunia2026 bolatipster",
  ],
  xiaohongshu: [
    "小红书 世界杯2026 竞彩 推荐",
    "小红书 足球 亚盘 预测 博主",
  ],
  wechat: [
    "微信公众号 世界杯2026 竞彩 预测",
    "微信 足球 亚盘 推荐 公众号",
  ],
};
const httpClient = axios.create({
  baseURL: BRIGHT_DATA_BASE_URL,
  headers: {
    Authorization: `Bearer ${BRIGHT_DATA_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

async function serpSearch(query, retries = 2) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&brd_json=1`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await httpClient.post("/request", {
        zone: SERP_ZONE,
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

async function unlockerFetch(url, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await httpClient.post("/request", {
        url: url,
        format: "raw",
      });
      console.log(`   OK unlocker ${url.slice(0,60)}... -> ${typeof res.data === "string" ? res.data.length : "json"} bytes`);
      return res.data;
    } catch (err) {
      const status = err.response && err.response.status;
      const msg = err.response ? err.response.data : err.message;
      console.error(`   FAIL ${attempt}/${retries} unlocker ${url.slice(0,60)}: ${status} ${JSON.stringify(msg).slice(0,150)}`);
      if (attempt === retries) return null;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

async function scrapeTwitterProfiles(profileUrls) {
  if (!profileUrls.length) return [];
  console.log(`\nEnriching ${profileUrls.length} Twitter profiles via Social Scraper API...`);

  try {
    const inputs = profileUrls.map(u => ({ url: u }));
    const triggerRes = await httpClient.post(
      `/datasets/v3/trigger?dataset_id=${TWITTER_PROFILE_DATASET}&format=json&include_errors=true`,
      inputs
    );
    const snapshotId = triggerRes.data && triggerRes.data.snapshot_id;
    if (!snapshotId) {
      console.error("   No snapshot_id returned:", JSON.stringify(triggerRes.data).slice(0,200));
      return [];
    }
    console.log(`   Snapshot: ${snapshotId}`);

    const start = Date.now();
    while (Date.now() - start < 180000) {
      const progRes = await httpClient.get(`/datasets/v3/progress/${snapshotId}`);
      const status = progRes.data && progRes.data.status;
      console.log(`   Progress: ${status}`);
      if (status === "ready") break;
      if (status === "failed") {
        console.error("   Snapshot failed:", JSON.stringify(progRes.data).slice(0,200));
        return [];
      }
      await new Promise(r => setTimeout(r, 8000));
    }

    const dlRes = await httpClient.get(`/datasets/v3/snapshot/${snapshotId}`, { params: { format: "json" } });
    const rows = Array.isArray(dlRes.data) ? dlRes.data : [dlRes.data];
    console.log(`   Downloaded ${rows.length} profile records`);
    return rows;
  } catch (err) {
    const status = err.response && err.response.status;
    const msg = err.response ? err.response.data : err.message;
    console.error(`   FAIL profile enrichment: ${status} ${JSON.stringify(msg).slice(0,200)}`);
    return [];
  }
}

function processSerpResult(item, platform, query) {
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
    location: "",
    search_query: query,
  };
}

function parseSogouHTML(html, query) {
  const results = [];
  if (!html || typeof html !== "string") return results;

  const blockRe = /<div class="txt-box">([\s\S]*?)<\/div>\s*<\/div>/g;
  const titleRe = /<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/;
  const accountRe = /class="account"[^>]*>([\s\S]*?)<\/(?:span|a)>/;
  const snippetRe = /<p[^>]*class="txt-info[^"]*"[^>]*>([\s\S]*?)<\/p>/;

  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    const tM = titleRe.exec(block);
    const aM = accountRe.exec(block);
    const sM = snippetRe.exec(block);
    if (tM) {
      const title = tM[2].replace(/<[^>]+>/g, "").trim();
      const account = aM ? aM[1].replace(/<[^>]+>/g, "").trim() : "";
      const snippet = sM ? sM[1].replace(/<[^>]+>/g, "").trim() : "";
      let link = tM[1];
      if (link.startsWith("/")) link = "https://weixin.sogou.com" + link;
      results.push({
        platform: "WeChat (微信)",
        username: account || title,
        display_name: title,
        followers: 0,
        bio: snippet,
        post_text: title,
        post_date: "",
        engagement: 0,
        hashtags_found: extractHashtags(query),
        profile_url: link,
        telegram_in_bio: extractTelegramLink(snippet),
        location: "China",
        search_query: query,
      });
    }
  }
  return results;
}

function parseXHSResponse(data, query) {
  const results = [];
  if (!data) return results;

  let text = typeof data === "string" ? data : JSON.stringify(data);

  const stateMatch = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (stateMatch) {
    try {
      const cleaned = stateMatch[1].replace(/:undefined/g, ":null");
      const state = JSON.parse(cleaned);
      const notes = (state.search && state.search.feeds && state.search.feeds._value) || [];
      notes.forEach(n => {
        const noteCard = n.noteCard || n;
        results.push({
          platform: "Xiaohongshu (小红书)",
          username: (noteCard.user && noteCard.user.userId) || "",
          display_name: (noteCard.user && noteCard.user.nickname) || "",
          followers: 0,
          bio: noteCard.title || "",
          post_text: noteCard.title || noteCard.desc || "",
          post_date: "",
          engagement: (noteCard.interactInfo && Number(noteCard.interactInfo.likedCount)) || 0,
          hashtags_found: extractHashtags(query),
          profile_url: noteCard.user && noteCard.user.userId
            ? `https://www.xiaohongshu.com/user/profile/${noteCard.user.userId}`
            : "",
          telegram_in_bio: "",
          location: "China",
          search_query: query,
        });
      });
    } catch (e) {
      console.log(`   XHS state parse error: ${e.message}`);
    }
  }
  return results;
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
  return url;
}

function extractHashtags(query) {
  return query.match(/#[\p{L}\p{N}_]+/gu) || [];
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

      if (item.followers > 100000) score += 50;
      else if (item.followers > 10000) score += 30;
      else if (item.followers > 1000) score += 15;
      else if (item.followers > 100) score += 5;

      if (item.is_verified) score += 10;

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
  console.log("WC2026 Tipster Radar v2 - Scrape Run");
  console.log(new Date().toISOString());
  console.log("SERP Zone: " + SERP_ZONE);

  const allResults = [];

  for (const platform of Object.keys(SEARCH_QUERIES)) {
    const queries = SEARCH_QUERIES[platform];
    console.log("\n" + platformLabel(platform) + " (SERP)...");
    for (const query of queries) {
      const organic = await serpSearch(query);
      organic.forEach(item => allResults.push(processSerpResult(item, platform, query)));
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("Raw results before enrichment: " + allResults.length);

  const twitterCandidates = allResults
    .filter(r => r.platform === "X (Twitter)" && r.profile_url)
    .map(r => r.profile_url.split("/status/")[0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 15);

  if (twitterCandidates.length) {
    const profiles = await scrapeTwitterProfiles(twitterCandidates);
    profiles.forEach(p => {
      allResults.forEach(r => {
        if (r.platform === "X (Twitter)" && r.profile_url && r.profile_url.includes(p.user_name || "___none___")) {
          r.followers = p.followers || 0;
          r.bio = p.biography || r.bio;
          r.is_verified = !!p.is_verified;
          r.display_name = p.profile_name || r.display_name;
        }
      });
    });
  }

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
  console.log("Written to docs/results.json");

  const archiveDir = path.join(outDir, "archive");
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const ts = new Date().toISOString().slice(0,16).replace(/[T:]/g,"-");
  fs.writeFileSync(path.join(archiveDir, "results_" + ts + ".json"), JSON.stringify(output));
  console.log("Archive: docs/archive/results_" + ts + ".json");

  console.log("Done.");
}

main().catch(err => {
  console.error("Fatal: " + err.message);
  process.exit(1);
});
