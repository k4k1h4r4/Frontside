(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  // Compare with the HTML's build, never a shared localStorage baseline:
  // another tab being current does not make this document current.
  const current = document.querySelector('meta[name="site-version"]')?.content;
  let checking = false;
  let lastCheck = 0;

  async function checkVersion() {
    if (!current || checking || document.visibilityState === 'hidden' ||
        Date.now() - lastCheck < 10000 || !/^https?:$/.test(location.protocol)) return;
    checking = true;
    lastCheck = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const endpoint = new URL('version.json', base);
      endpoint.searchParams.set('_check', Date.now().toString());
      const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const { version } = await response.json();
      if (typeof version !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(version) || version === current) return;

      const target = new URL(location.href);
      // A CDN may still serve old HTML. Only attempt once per release/URL,
      // even if storage is unavailable (Safari privacy settings).
      if (target.searchParams.get('_site_version') === version) return;
      target.searchParams.set('_site_version', version);
      target.searchParams.set('_refresh', Date.now().toString());
      location.replace(target.href);
    } catch {
      // Offline, timeout, or a partial deployment: keep the current page usable.
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }

  checkVersion();
  window.addEventListener('pageshow', checkVersion);
  window.addEventListener('online', checkVersion);
  document.addEventListener('visibilitychange', checkVersion);
})();
