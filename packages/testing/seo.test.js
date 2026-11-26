'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('apps/web/index.html');
const config = read('apps/web/config.js');
const analytics = read('apps/web/src/analytics.js');
const utils = read('apps/web/src/utils.js');
const app = read('apps/web/src/app.js');
const publicView = read('apps/web/src/views/public.js');
const workflow = read('.github/workflows/pages.yml');

test('the shell has indexable platform metadata', () => {
  assert.match(html, /<title>Re-EL ECD \| Run your ECD centre with calm, clarity and care<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ecd\.re-el\.co\.za\/"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/ecd\.re-el\.co\.za\/">/);
  assert.match(html, /<meta property="og:site_name" content="Re-EL ECD">/);
  assert.match(html, /<meta property="og:locale" content="en_ZA">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/ecd\.re-el\.co\.za\/assets\/branding\/logo-re-el-ecd\.png">/);
  assert.match(html, /<meta name="google-site-verification" content="" id="reel-search-verification">/);
});

test('CSP permits Google Analytics but only as an explicit addition', () => {
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes('https://www.googletagmanager.com'));
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline' 'unsafe-eval'"));
});

test('deployment config holds all public SEO/analytics identifiers', () => {
  ['REEL_API_BASE', 'REEL_SITE_BASE', 'REEL_PLATFORM_URL', 'REEL_GA4_MEASUREMENT_ID', 'REEL_SEARCH_CONSOLE_VERIFICATION']
    .forEach((key) => assert.ok(config.includes('window.' + key), key));
  ['REEL_SITE_BASE', 'REEL_PLATFORM_URL', 'REEL_GA4_MEASUREMENT_ID', 'REEL_SEARCH_CONSOLE_VERIFICATION']
    .forEach((key) => assert.ok(workflow.includes(key), key));
});

test('GA4 loads only when configured and analytics storage is denied by default', () => {
  assert.match(analytics, /let measurementId = String\(config\.REEL_GA4_MEASUREMENT_ID \|\| ''\)\.trim\(\)/);
  assert.match(analytics, /if \(state\.loaded \|\| !measurementId\) return;/);
  assert.match(analytics, /analytics_storage: state\.consent === 'granted' \? 'granted' : 'denied'/);
  assert.match(analytics, /ad_storage: 'denied'/);
  assert.match(analytics, /send_page_view: false/);
  assert.match(analytics, /window\.addEventListener\('hashchange'/);
  assert.match(app, /Reel\.analytics\.pageView\(\)/);
});

test('page paths never carry record ids to analytics', () => {
  assert.match(analytics, /replace\(\/\[0-9a-f\]\{8\}-.*\/gi, ':id'\)/);
  assert.match(analytics, /replace\(\/\\\/\\d\+\/g, '\/:id'\)/);
});

test('consent can be granted, denied and remembered', () => {
  assert.match(analytics, /CONSENT_KEY = 'reel-analytics-consent'/);
  assert.match(analytics, /writeConsent\(value\)/);
  assert.match(analytics, /data-analytics="deny"/);
  assert.match(analytics, /data-analytics="allow"/);
  assert.match(analytics, /R\.analytics = \{/);
});

test('Search Console token comes from deployment config', () => {
  assert.match(analytics, /REEL_SEARCH_CONSOLE_VERIFICATION/);
  assert.match(analytics, /applyVerification\(config\.REEL_SEARCH_CONSOLE_VERIFICATION\)/);
});

test('platform homepage publishes SEO and structured data', () => {
  assert.match(publicView, /title: 'Re-EL ECD \| Run your ECD centre with calm, clarity and care'/);
  assert.match(publicView, /schema: \{/);
  assert.match(publicView, /'@type': 'Organization'/);
  assert.match(publicView, /'@type': 'WebSite'/);
  assert.match(publicView, /'@type': 'SoftwareApplication'/);
  assert.match(utils, /const structured = meta\.schema \|\| \{/);
  assert.match(app, /const isPlatformHome = route\.view === 'platformHome'/);
  assert.match(app, /\? \(canonicalBase \|\| \(Reel\.siteBase/);
});

test('private areas are noindex and 404s are noindex', () => {
  assert.match(utils, /function setRobots\(value\)/);
  assert.match(utils, /Reel\.setRobots = setRobots/);
  assert.match(app, /this\.route\.area !== 'public'\) Reel\.setRobots\('noindex, nofollow'\)/);
  assert.match(app, /\{ robots: 'noindex, nofollow' \}\);/);
});

test('robots and sitemap are served as static files', () => {
  const robots = read('apps/web/robots.txt');
  const sitemap = read('apps/web/sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/ecd\.re-el\.co\.za\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/ecd\.re-el\.co\.za\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/ecd\.re-el\.co\.za\/#\/legal\/privacy<\/loc>/);
  assert.match(read('vercel.json'), /"src": "\/\(\.\*\\\\\.\[a-zA-Z0-9\]\+\)"/);
});

test('public routes without their own SEO still get a canonical and index directive', () => {
  assert.match(app, /route\.area === 'public' \? \{/);
  assert.match(utils, /seoMeta\('robots', opts\.robots \|\| 'index, follow'\)/);
});

test('platform admins can edit SEO and analytics settings at runtime', () => {
  const platform = read('apps/web/src/views/platform.js');
  assert.match(platform, /if \(name === 'platformSeo'\)/);
  assert.match(platform, /Search & analytics/);
  assert.match(platform, /name: 'measurementId', label: 'GA4 measurement ID'/);
  assert.match(platform, /name: 'verification', label: 'Search Console verification token'/);
  assert.match(platform, /analytics: \{[\s\S]{0,120}measurementId: data\.measurementId/);
  assert.match(read('apps/api/src/modules/platform.js'), /normalisePlatformAnalytics/);
  assert.match(read('apps/api/src/modules/platform.js'), /analytics: normalisePlatformAnalytics\(platformSettings\.analytics\)/);
  assert.match(analytics, /function configure\(runtime\)/);
  assert.match(app, /Reel\.analytics\.configure\(this\.platformBrand\.analytics\)/);
  assert.match(app, /if \(isPlatformHome && this\.platformBrand && this\.platformBrand\.seo\)/);
});

test('social share image can be uploaded and is stored as an absolute URL', () => {
  const platform = read('apps/web/src/views/platform.js');
  assert.match(platform, /name: 'image', label: 'Social share image', type: 'media'/);
  assert.match(platform, /accept: 'image\/jpeg,image\/png,image\/webp'/);
  assert.match(platform, /scope: 'branding'/);
  const api = read('apps/api/src/modules/platform.js');
  assert.match(api, /if \(image\.startsWith\('\/'\)\)/);
  assert.ok(api.includes("base.replace(/\\/+$/, '') + image"));
});

test('uploaded media previews resolve against the API origin', () => {
  const utils = read('apps/web/src/utils.js');
  const app = read('apps/web/src/app.js');
  assert.match(utils, /const checked = resolveMediaUrl\(url\)/);
  assert.match(app, /Reel\.resolveMediaUrl \? Reel\.resolveMediaUrl\(url\) : url/);
  assert.match(utils, /key=\[\^&\]\*\\\\\.\(/);
});

test('social image uploads store an absolute URL and need no pasted link', () => {
  const platform = read('apps/web/src/views/platform.js');
  const app = read('apps/web/src/app.js');
  assert.match(platform, /scope: 'branding', absolute: true/);
  assert.match(app, /const stored = field\.absolute && Reel\.resolveMediaUrl \? Reel\.resolveMediaUrl\(asset\.url\) : asset\.url/);
});

test('billing summary exposes plan usage and an upgrade path', () => {
  const billing = read('apps/api/src/modules/billing.js');
  const utils = read('apps/web/src/views/settings.js');
  const app = read('apps/web/src/app.js');
  assert.match(billing, /planUsage,/);
  assert.match(billing, /upgradePlans,/);
  assert.match(billing, /router\.post\('\/billing\/subscription\/upgrade'/);
  assert.match(billing, /purpose: 'platform_subscription_upgrade'/);
  assert.match(utils, /R\.card\('Plan usage'/);
  assert.match(utils, /Grace period \(' \+ row\.graceDaysLeft/);
  assert.match(utils, /plan-upgrade-card/);
  assert.match(app, /async upgradePlan\(planKey, billingPeriod\)/);
  assert.match(read('apps/api/src/modules/finance.js'), /applyUpgrade\(client, intent\)/);
});

test('plan limits are enforced with a grace window', () => {
  const svc = read('apps/api/src/services/entitlements-service.js');
  assert.match(svc, /GRACE_DAYS = 7/);
  assert.match(svc, /state = 'grace'/);
  assert.match(svc, /allowed: false, state: 'over'/);
  assert.match(svc, /if \(!limit \|\| r < 0\.9\)/);
  ['learners.js', 'admissions.js', 'staff.js', 'access.js', 'media.js'].forEach((file) => {
    assert.match(read('apps/api/src/modules/' + file), /entitlements\.check\(/, file);
  });
  assert.match(read('apps/api/src/services/subscription-billing-service.js'), /sp\.max_storage_bytes/);
});

test('platform console flags over-limit tenants separately', () => {
  const platform = read('apps/web/src/views/platform.js');
  assert.match(platform, /const limitState = \(row\) =>/);
  assert.match(platform, /const overLimit = subs\.filter/);
  assert.match(platform, /badge-danger\">Over limit/);
  assert.match(platform, /Over limit', value: R\.number\(overLimit\.length\)/);
});

test('rhyme audio uses a public cookie-free stream on mobile', () => {
  const media = read('apps/api/src/modules/media.js');
  const rhymes = read('apps/web/src/views/nursery-rhymes.js');
  const player = read('apps/web/src/rhyme-player.js');
  const css = read('apps/web/assets/styles.css');

  assert.match(media, /router\.get\('\/public\/rhyme-audio'/);
  assert.match(media, /\{ public: true \}/);
  assert.match(media, /asset\.scope !== 'nursery-rhyme'/);
  assert.match(media, /asset\.status !== 'ready'/);
  assert.match(media, /presignGet\(asset\.storage_key, \{ expires: 900 \}\)/);

  assert.match(rhymes, /\/api\/v1\/public\/rhyme-audio\?key=/);
  assert.match(rhymes, /decodeURIComponent\(match\[1\]\)/);

  assert.match(player, /setAttribute\('playsinline', ''\)/);
  assert.match(player, /pointer: coarse/);
  assert.match(player, /continueAction: null/);
  assert.match(player, /state\.continueAction = 'next'/);
  assert.match(player, /case 'continue': continuePlayback\(\); break;/);
  assert.match(player, /data-np="continue"/);

  assert.match(css, /\.np-continue\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /grid-template-areas:\s*"prev play next meta queue read close"/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
});

test('operator agreement and safeguarding disclaimer are published legal pages', () => {
  const appRoute = read('apps/web/src/app.js');
  const sitemap = fs.readFileSync(path.join(root, 'apps/web', 'sitemap.xml'), 'utf8');
  const defaults = read('apps/api/src/services/document-service.js');
  const review = read('docs/legal-review.md');

  assert.match(appRoute, /route\('\/legal\/data-processing-agreement', 'public', 'legalDataProcessingAgreement'/);
  assert.match(appRoute, /route\('\/legal\/safeguarding-disclaimer', 'public', 'legalSafeguardingDisclaimer'/);
  assert.match(sitemap, /#\/legal\/data-processing-agreement<\/loc>/);
  assert.match(sitemap, /#\/legal\/safeguarding-disclaimer<\/loc>/);

  assert.match(publicView, /V\.legalDataProcessingAgreement = legalDocViews\('data-processing-agreement'\)/);
  assert.match(publicView, /V\.legalSafeguardingDisclaimer = legalDocViews\('safeguarding-disclaimer'\)/);
  assert.match(publicView, /DRAFT FOR LEGAL REVIEW — NOT YET REVIEWED BY A SOUTH AFRICAN ATTORNEY/);
  assert.match(publicView, /does not automatically register an ECD centre/);
  assert.match(publicView, /authorised collectors must be correctly registered/i);
  assert.match(publicView, /does not replace physical supervision/);
  assert.match(publicView, /Operator \/ Data Processing Agreement/);

  assert.match(defaults, /legal\('data-processing-agreement'/);
  assert.match(defaults, /legal\('safeguarding-disclaimer'/);
  assert.match(defaults, /does not register an ECD centre or certify legal compliance/);
  assert.match(review, /NOT REVIEWED BY A SOUTH AFRICAN ATTORNEY/);
  assert.match(review, /Cross-border transfers/);
});
