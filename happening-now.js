// Fills the "Live Keno" item in the Happening now strip from the
// same public KenoCloud feed keno.html uses. Battleship lobby status
// would need a small public status endpoint, so that item is static text.
(() => {
  'use strict';
  const LATEST = 'https://kenocloud.com/kenocloud/casino/41/game/1/balldraw/latest';
  const value = document.getElementById('now-keno-value');
  const dot = document.getElementById('now-keno-dot');
  if (!value || !dot) return;

  function ago(ts) {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (!Number.isFinite(mins)) return '';
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  async function update() {
    if (document.visibilityState === 'hidden') return;
    try {
      const res = await fetch(LATEST, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(res.status);
      const game = await res.json();
      const fresh = Date.now() - new Date(game.timestamp).getTime() < 10 * 60000;
      value.textContent = `Game #${game.racenumber} · ${ago(game.timestamp)}`;
      dot.classList.toggle('live', fresh);
    } catch {
      value.textContent = 'See the latest draw';
      dot.classList.remove('live');
    }
  }

  update();
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', update);
})();
