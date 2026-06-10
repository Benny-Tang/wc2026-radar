/**
 * Bright Data Configuration
 * Dataset IDs & API settings for WC2026 scraper
 *
 * Full dataset catalog: https://brightdata.com/products/datasets/social-media
 * API docs: https://docs.brightdata.com/scraping-automation/web-data-apis/web-scraper-api/overview
 */

module.exports = {
  // ─── API Settings ──────────────────────────────────────────────────────────
  api: {
    base_url: "https://api.brightdata.com",
    key: process.env.BRIGHT_DATA_API_KEY,
    // Web Unlocker zone (set in Bright Data dashboard)
    unlocker_zone: process.env.BD_UNLOCKER_ZONE || "web_unlocker1",
    // SERP API zone
    serp_zone: process.env.BD_SERP_ZONE || "serp_api1",
  },

  // ─── Dataset IDs ───────────────────────────────────────────────────────────
  // Find these at: https://brightdata.com/cp/datasets
  datasets: {
    // X (Twitter)
    twitter_search_posts:   "gd_lwxkxvnf1cynvib9co",  // Search by hashtag/keyword
    twitter_profiles:       "gd_l535itcfvknd9y7j8i",  // User profiles by handle

    // Facebook
    facebook_posts:         "gd_l1vijqt9jfj9b31sf",   // Public posts by hashtag
    facebook_pages:         "gd_l4xc2ljh3wmdbd65xg",  // Page data by URL
    facebook_groups:        "gd_m0xi4bjrhl7ke6ycnz",  // Public group posts

    // Instagram (bonus platform)
    instagram_hashtag:      "gd_lyclm2p30l5ui5q1kn",  // Posts by hashtag
    instagram_profiles:     "gd_l1vikfnt1wl4c6yt7l",  // User profiles

    // TikTok
    tiktok_hashtag:         "gd_l7q7dkf244hwjntr0",   // Videos by hashtag
    tiktok_profiles:        "gd_l51ifxdr1i5rl9tq3u",  // User profiles

    // YouTube (bonus)
    youtube_search:         "gd_lk4g0t2y4r2t2kxl3q",  // Videos by keyword
  },

  // ─── Budget Allocation ─────────────────────────────────────────────────────
  // Based on $250 Bright Data credits
  budget: {
    social_scraper_api:  150,  // Primary: X + Facebook hashtag scraping
    serp_api:             75,  // Secondary: Google -> Telegram/WeChat discovery
    web_unlocker:         25,  // Tertiary: XHS + WeChat Sogou
    reserve:               0,
  },

  // ─── Cost Estimates ────────────────────────────────────────────────────────
  // Bright Data pricing (approximate, verify at brightdata.com/pricing)
  costs: {
    social_scraper_per_1k:  1.50,   // $1.50 / 1,000 records
    serp_per_1k:            3.00,   // $3.00 / 1,000 SERP results
    web_unlocker_per_1k:    3.00,   // $3.00 / 1,000 unblocked pages

    // With $150 Social Scraper budget:
    // 150 / 1.50 * 1000 = 100,000 records available
    estimated_records: {
      twitter:       25000,  // 25k tweets across 15 hashtags
      facebook:      20000,  // 20k posts
      tiktok:        15000,  // 15k videos (bonus)
      instagram:     10000,  // 10k posts (bonus)
    },
  },

  // ─── Proxy Settings ────────────────────────────────────────────────────────
  // Used for Web Unlocker requests (WeChat/XHS)
  proxy: {
    // Bright Data residential proxy
    host:     "brd.superproxy.io",
    port:     22225,
    username: `brd-customer-${process.env.BD_CUSTOMER_ID}-zone-residential`,
    password: process.env.BRIGHT_DATA_API_KEY,

    // Country rotation for geo-specific content
    countries: ["MY", "SG", "HK", "TW", "CN"],
  },
};
