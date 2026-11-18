'use strict';

/* Boot-time wiring that must stay external: CSP hashes inline scripts are
   brittle and silently break on refactor. */

// Create icons as soon as Lucide arrives (the library loads async/defer).
function createIconsWhenReady() {
  if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  else setTimeout(createIconsWhenReady, 120);
}
window.addEventListener('DOMContentLoaded', createIconsWhenReady);
setTimeout(createIconsWhenReady, 1500);

// Register the offline service worker after load — offline is a bonus, not a blocker.
window.addEventListener('load', function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* non-fatal */ });
  }
});
