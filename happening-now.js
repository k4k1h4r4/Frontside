// Fills the homepage "Happening now" strip.
// - Live Keno: latest game from the same public KenoCloud feed keno.html uses.
// - Battleship: public lobby summary from the Battleship server (counts only,
//   no names). Until the server offers it, the item keeps its static text.
(() => {
  'use strict';
  const KENO_LATEST = 'https://kenocloud.com/kenocloud/casino/41/game/1/balldraw/latest';
  const BATTLE_SUMMARY = 'https://znqnnaslskjewfxcswxw.supabase.co/functions/v1/battleship?action=summary';
  const MODES = ['live-2', 'live-1', 'rng']; // live-2 is the default mode, so it wins ties

  const $ = (id) => document.getElementById(id);
  const kenoValue = $('now-keno-value'), kenoDot = $('now-keno-dot');
  const battleLink = $('now-battle'), battleValue = $('now-battle-value'), battleIcon = $('now-battle-icon');

  function ago(ts) {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (!Number.isFinite(mins)) return '';
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function updateKeno() {
    if (!kenoValue || !kenoDot) return;
    try {
      const game = await getJson(KENO_LATEST);
      const fresh = Date.now() - new Date(game.timestamp).getTime() < 10 * 60000;
      kenoValue.textContent = `Game #${game.racenumber} · ${ago(game.timestamp)}`;
      kenoDot.classList.toggle('live', fresh);
    } catch {
      kenoValue.textContent = 'See the latest draw';
      kenoDot.classList.remove('live');
    }
  }

  // Pure: turn the server summary into the strip's text and link.
  function describeBattle(modes) {
    let waiting = 0, busiest = null, battle = null;
    for (const mode of MODES) {
      const m = modes?.[mode];
      if (!m) continue;
      const lobby = m.lobby?.captains || 0;
      waiting += lobby;
      if (lobby && (!busiest || lobby > busiest.count)) busiest = { mode, count: lobby };
      const alive = m.battle?.captains || 0;
      if (alive && (!battle || alive > battle.count)) battle = { mode, count: alive };
    }
    if (waiting) return { text: `${waiting} captain${waiting === 1 ? '' : 's'} ready`, mode: busiest.mode, live: true };
    if (battle) return { text: `Battle on · ${battle.count} left`, mode: battle.mode, live: true };
    return { text: 'Captains wanted', mode: null, live: false };
  }

  async function updateBattle() {
    if (!battleLink || !battleValue) return;
    let view = { text: 'Captains wanted', mode: null, live: false };
    try {
      const data = await getJson(BATTLE_SUMMARY);
      if (data && data.modes) view = describeBattle(data.modes);
    } catch {
      // Server unavailable or not updated yet: keep the static text.
    }
    battleValue.textContent = view.text;
    battleLink.href = view.mode ? `battleship.html?gameMode=${encodeURIComponent(view.mode)}` : 'battleship.html';
    battleIcon?.classList.toggle('live', view.live);
  }

  function update() {
    if (document.visibilityState === 'hidden') return;
    updateKeno();
    updateBattle();
  }

  if (typeof module === 'object' && module.exports) module.exports = { describeBattle };
  update();
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', update);
})();
