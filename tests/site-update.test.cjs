const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('site-update.js', 'utf8');

async function run({ version = 'new', href = 'https://example.com/Arcade/arcade.html?room=123#game', fail = false, hidden = false } = {}) {
  const redirects = [], requests = [], events = {};
  const context = {
    URL, AbortController, setTimeout, clearTimeout, Date,
    location: { href, protocol: 'https:', replace: url => redirects.push(url) },
    document: {
      currentScript: { src: 'https://example.com/site-update.js?v=old' },
      querySelector: () => ({ content: 'old' }),
      visibilityState: hidden ? 'hidden' : 'visible',
      addEventListener: (name, fn) => { events[name] = fn; }
    },
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw new Error('offline');
      return { ok: true, json: async () => ({ version }) };
    }
  };
  vm.runInNewContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return { redirects, requests, events };
}

test('stale HTML reloads with fresh URL and preserves query/hash', async () => {
  const result = await run();
  assert.equal(result.redirects.length, 1);
  const url = new URL(result.redirects[0]);
  assert.equal(url.searchParams.get('room'), '123');
  assert.equal(url.hash, '#game');
  assert.equal(url.searchParams.get('_site_version'), 'new');
  assert.ok(url.searchParams.get('_refresh'));
  assert.equal(result.requests[0].url.pathname, '/version.json');
  assert.equal(result.requests[0].options.cache, 'no-store');
});
test('current version does not reload', async () => assert.equal((await run({ version: 'old' })).redirects.length, 0));
test('stale CDN response cannot cause a reload loop', async () => assert.equal((await run({ href: 'https://example.com/?_site_version=new' })).redirects.length, 0));
test('offline and invalid releases leave page usable', async () => {
  assert.equal((await run({ fail: true })).redirects.length, 0);
  assert.equal((await run({ version: '<invalid>' })).redirects.length, 0);
});
test('hidden tabs defer checks and lifecycle hooks are installed', async () => {
  const result = await run({ hidden: true });
  assert.equal(result.requests.length, 0);
  assert.deepEqual(Object.keys(result.events).sort(), ['online', 'pageshow', 'visibilitychange']);
});
