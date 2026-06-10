# WC2026 Tipster Radar 🌍⚽
**Bright Data · $250 Credits · GitHub Pages · Zero Server**

Scrapes WC2026 hashtags across Telegram, X, WeChat, Xiaohongshu, Facebook.  
Results auto-publish to **GitHub Pages** every 6 hours via GitHub Actions.

---

## Setup (5 minutes)

### 1. Copy files into your repo
```
wc2026-actors/
├── docs/
│   ├── index.html        ← Dashboard (GitHub Pages)
│   └── results.json      ← Auto-updated by scraper
├── src/
│   └── scraper.js
├── .github/workflows/
│   └── scrape.yml
└── package.json
```

### 2. Enable GitHub Pages
Repo → **Settings → Pages → Source: Deploy from a branch**  
Branch: `main` | Folder: `/docs`

### 3. Add Bright Data secret
Repo → **Settings → Secrets → Actions → New repository secret**  
- Name: `BRIGHT_DATA_API_KEY`  
- Value: *(your Bright Data API key)*

### 4. Run first scrape
Repo → **Actions → WC2026 Scraper → Run workflow**

Results appear at: `https://benny-tang.github.io/wc2026-actors/`

---

## How it works

```
GitHub Actions (every 6h)
  └── node src/scraper.js
        ├── Bright Data Social API  → Twitter + Facebook hashtags
        ├── Bright Data SERP API    → Telegram group discovery
        └── Bright Data Web Unlocker → WeChat + XHS
              ↓
        docs/results.json  (committed back to repo)
              ↓
        GitHub Pages serves dashboard + results.json
```

---

## Budget ($250 Bright Data)

| Service | Budget | ~Records |
|---------|--------|----------|
| Social Scraper API | $150 | 100,000 posts |
| SERP API | $75 | 25,000 results |
| Web Unlocker | $25 | 8,000 pages |

---

## Scoring

| Tier | Score | Signal |
|------|-------|--------|
| 🥇 1 | 50+ | 1k+ followers + keywords + Telegram link |
| 🥈 2 | 25–49 | Active + some keywords |
| 🥉 3 | <25 | Appeared in hashtag/SERP |

**Telegram link in bio = +25 pts** (strongest B2B indicator)
