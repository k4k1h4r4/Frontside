(function (root) {
  'use strict';
  const SUPABASE_URL = 'https://znqnnaslskjewfxcswxw.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_0pVZp5JcAc9lSIClZD5eqQ_9Q33F7Uf';
  const MOUNTAIN_TIME_ZONE = 'America/Denver';
  const POST_WINDOW_MS = 24 * 60 * 60 * 1000;
  function sortEntries(entries) {
    return [...entries].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { sortEntries };
  if (!root.document) return;
  const list = document.getElementById('live-feed-list');
  if (!list) return;
  const sources = new Map();
  root.liveFeed = {
    setSource(name, entries) {
      sources.set(name, entries);
      list.replaceChildren(...sortEntries([...sources.values()].flat()).map(entry => entry.node));
    }
  };
  const endpoint = `${SUPABASE_URL}/rest/v1/live_feed_posts`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };
  const textarea = document.getElementById('live-feed-message');
  const counter = document.getElementById('live-feed-count');
  const submit = document.getElementById('live-feed-submit');
  const feedback = document.getElementById('live-feed-submit-message');
  const status = document.getElementById('posts-feed-status');
  const posts = new Map();
  let loading = false;
  function updateCounter() {
    const remaining = 280 - textarea.value.length;
    counter.textContent = `${remaining} character${remaining === 1 ? '' : 's'}`;
  }
  function say(message) {
    feedback.textContent = message;
    feedback.classList.add('is-visible');
  }
  function render() {
    // Drop posts that have aged out of the 24-hour window since they were loaded.
    const cutoff = Date.now() - POST_WINDOW_MS;
    for (const [id, post] of posts) if (Date.parse(post.created_at) < cutoff) posts.delete(id);
    const entries = [...posts.values()].map(post => {
      const node = document.createElement('li');
      node.className = 'live-event';
      const time = document.createElement('time');
      time.className = 'live-event-time';
      time.dateTime = post.created_at;
      time.textContent = new Date(post.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZone: MOUNTAIN_TIME_ZONE
      });
      const message = document.createElement('p');
      message.className = 'live-event-message live-user-message';
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '📣';
      const text = document.createElement('span');
      text.textContent = post.message;
      message.append(icon, text);
      node.append(time, message);
      return { id: `post:${post.id}`, timestamp: post.created_at, node };
    });
    root.liveFeed.setSource('posts', entries);
  }
  async function request(query, options = {}) {
    const response = await fetch(endpoint + query, {
      ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Posts unavailable (${response.status}).`);
    return response.json();
  }
  async function refreshPosts() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const since = new Date(Date.now() - POST_WINDOW_MS).toISOString();
      const rows = await request('?select=id,message,created_at' +
        `&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc,id.desc&limit=100`);
      // Keep posts saved while this request was in flight.
      rows.forEach(post => posts.set(post.id, post));
      render();
      status.textContent = '';
    } catch (_) {
      status.textContent = 'Community posts could not be refreshed. Retrying automatically.';
    } finally { loading = false; }
  }
  textarea.addEventListener('input', updateCounter);
  submit.addEventListener('click', async () => {
    if (submit.disabled) return;
    const message = textarea.value.trim();
    if (!message || message.length > 280) {
      say('Enter a message of 1–280 characters.');
      textarea.focus();
      return;
    }
    submit.disabled = true;
    textarea.disabled = true;
    submit.textContent = 'POSTING…';
    say('Posting…');
    try {
      const rows = await request('', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ message })
      });
      rows.forEach(post => posts.set(post.id, post));
      render();
      textarea.value = '';
      updateCounter();
      say('Posted! Your message is live.');
    } catch (_) {
      say('Could not confirm your post. Your text is saved here; check the feed before trying again.');
      refreshPosts();
    } finally {
      submit.disabled = false;
      textarea.disabled = false;
      submit.textContent = 'POST IT';
    }
  });
  updateCounter();
  refreshPosts();
  setInterval(refreshPosts, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPosts(); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
