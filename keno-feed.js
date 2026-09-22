(function (root) {
  'use strict';
  const BASE = 'https://kenocloud.com/kenocloud/casino/41/game/1/balldraw';
  const WINDOW = 50;
  const MOUNTAIN_TIME_ZONE = 'America/Denver';
  const cache = new Map();

  // A streak is exact only after observing its preceding opposite result.
  function analyze(games, firstEventId) {
    const states = Array.from({ length: 80 }, () => ({ hit: null, count: 0, known: false }));
    const events = [];
    for (const game of games) {
      const drawn = new Set(game.balls);
      states.forEach((state, index) => {
        const number = index + 1;
        const hit = drawn.has(number);
        if (state.hit === hit) state.count++;
        else {
          state.known = state.hit !== null;
          state.hit = hit;
          state.count = 1;
        }
        if (game.raceid < firstEventId || !state.known || state.count < (hit ? 3 : 15)) return;
        const kind = hit ? 'HOT' : 'COLD';
        events.push({
          id: `${game.raceid}:${kind}:${number}`,
          raceid: game.raceid,
          racenumber: game.racenumber,
          kind,
          timestamp: game.timestamp,
          title: `${kind} STREAK on ${number}!`,
          detail: `${hit ? 'Drawn' : 'No draws'} for ${state.count} straight games!`
        });
      });
    }
    return { events, states };
  }

  function groupByDraw(events) {
    const draws = new Map();
    for (const event of events) {
      if (!draws.has(event.raceid)) {
        draws.set(event.raceid, {
          id: `keno:${event.raceid}`, timestamp: event.timestamp,
          racenumber: event.racenumber, alerts: []
        });
      }
      draws.get(event.raceid).alerts.push(event);
    }
    return [...draws.values()];
  }

  async function fetchGame(id) {
    if (id !== 'latest' && cache.has(id)) return cache.get(id);
    const response = await fetch(`${BASE}/${id}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Keno results unavailable (${response.status}).`);
    const game = await response.json();
    game.raceid = Number(game.raceid);
    if (!Number.isSafeInteger(game.raceid) || (id !== 'latest' && game.raceid !== id) ||
        !Array.isArray(game.balls) || game.balls.length !== 20 || new Set(game.balls).size !== 20 ||
        game.balls.some(n => !Number.isInteger(n) || n < 1 || n > 80) ||
        !Number.isFinite(Date.parse(game.timestamp))) {
      throw new Error('Incomplete Keno results. Please try again shortly.');
    }
    cache.set(game.raceid, game);
    for (const key of cache.keys()) if (key < game.raceid - 550) cache.delete(key);
    return game;
  }

  async function loadEvents() {
    const latest = await fetchGame('latest');
    const firstEventId = latest.raceid - WINDOW + 1;
    const games = [latest];
    // Fetch in small batches. Extra history establishes exact counts at the window boundary.
    for (let offset = 1; offset < 500; offset += 5) {
      const ids = Array.from({ length: Math.min(5, 500 - offset) }, (_, i) => latest.raceid - offset - i);
      const batch = await Promise.all(ids.map(fetchGame));
      games.push(...batch);
      if (games.length <= WINDOW) continue;
      const chronological = [...games].reverse();
      const prefix = chronological.filter(game => game.raceid <= firstEventId);
      if (analyze(prefix, firstEventId).states.every(state => state.known)) {
        return analyze(chronological, firstEventId).events.reverse();
      }
    }
    throw new Error('Not enough Keno history to confirm exact streak counts.');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { analyze, groupByDraw };
  if (!root.document) return;
  const list = document.getElementById('live-feed-list');
  const status = document.getElementById('keno-feed-status');
  if (!list || !status) return;
  let loading = false;
  let loaded = false;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    status.textContent = 'Checking Keno streaks…';
    try {
      const events = await loadEvents();
      const entries = [];
      groupByDraw(events).forEach(event => {
        const item = document.createElement('li');
        item.className = 'live-event';
        item.dataset.eventId = event.id;
        const time = document.createElement('time');
        time.className = 'live-event-time';
        time.dateTime = event.timestamp;
        time.textContent = new Date(event.timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          timeZone: MOUNTAIN_TIME_ZONE
        });
        const body = document.createElement('div');
        body.className = 'keno-draw';
        const heading = document.createElement('p');
        heading.className = 'keno-draw-heading';
        heading.textContent = event.racenumber != null ? `Keno Game #${event.racenumber}` : 'Keno draw';
        body.append(heading);
        event.alerts.forEach(alert => {
          const message = document.createElement('p');
          message.className = `live-event-message keno-streak keno-streak--${alert.kind.toLowerCase()}`;
          const icon = document.createElement('span');
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = alert.kind === 'HOT' ? '🔥' : '🧊';
          const text = document.createElement('span');
          const title = document.createElement('strong');
          title.textContent = alert.title;
          const detail = document.createElement('span');
          detail.textContent = alert.detail;
          text.append(title, document.createElement('br'), detail);
          message.append(icon, text);
          body.append(message);
        });
        item.append(time, body);
        entries.push({ id: event.id, timestamp: event.timestamp, node: item });
      });
      if (root.liveFeed) root.liveFeed.setSource('keno', entries);
      else list.replaceChildren(...entries.map(entry => entry.node));
      loaded = true;
      status.textContent = events.length ? 'Keno streaks from the latest 50 games. Updates while this page is visible.' : 'No qualifying Keno streaks in the latest 50 games.';
    } catch (error) {
      status.textContent = `${loaded ? 'Showing previous results. ' : ''}${error.message} Retrying automatically.`;
    } finally {
      loading = false;
    }
  }
  refresh();
  setInterval(refresh, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
