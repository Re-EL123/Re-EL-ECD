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
 */
window.REEL_API_BASE = window.REEL_API_BASE || '';
