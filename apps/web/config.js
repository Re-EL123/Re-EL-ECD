/*
 * Deployment configuration.
 *
 * Leave REEL_API_BASE empty when the web app and API are served from the same
 * origin (the default for Vercel and local development).
 *
 * When the frontend is hosted separately, for example on GitHub Pages, set the
 * API origin here or inject it during deployment:
 *
 *   window.REEL_API_BASE = 'https://your-api.vercel.app';
 *
 * The API must list the frontend origin in FRONTEND_ORIGIN and set
 * CROSS_SITE_COOKIES=true so the session cookie is sent on cross-site requests.
 *
 * SEO / analytics values are public by design. Keep them here (or inject them
 * at deploy time) rather than hardcoding identifiers in views:
 *
 *   REEL_SITE_BASE                    canonical public site origin
 *   REEL_PLATFORM_URL                 platform marketing site URL
 *   REEL_GA4_MEASUREMENT_ID           GA4 measurement ID (G-XXXXXXX)
 *   REEL_SEARCH_CONSOLE_VERIFICATION  Google Search Console meta token
 */
window.REEL_API_BASE = window.REEL_API_BASE || '';
window.REEL_SITE_BASE = window.REEL_SITE_BASE || '';
window.REEL_PLATFORM_URL = window.REEL_PLATFORM_URL || '';
window.REEL_GA4_MEASUREMENT_ID = window.REEL_GA4_MEASUREMENT_ID || '';
window.REEL_SEARCH_CONSOLE_VERIFICATION = window.REEL_SEARCH_CONSOLE_VERIFICATION || '';
