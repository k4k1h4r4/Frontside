const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { sortEntries, postView } = require('../live-feed-posts.js');
const NOW = '2026-09-22T18:30:00Z';
function element() {
  return { children: [], value: '', disabled: false, classList: { add() {} }, handlers: {},
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, handler) { this.handlers[type] = handler; }, focus() {} };
}
// Loads the page script against a fake DOM with the clock pinned to NOW.
async function load(respond) {
  const nodes = new Map();
  const document = { hidden: false, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  }, createElement: element, addEventListener() {} };
  const calls = [];
  const context = vm.createContext({ document, setInterval() {}, AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return respond(url, options);
    }
  });
  vm.runInContext(`Date.now = () => Date.parse('${NOW}');`, context);
  vm.runInContext(fs.readFileSync('./live-feed-posts.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, calls, context };
}
test('posts and Keno sort by occurrence time, including different offsets', () => {
  const entries = [
    { id: 'post:1', timestamp: '2026-09-22T18:00:00Z' },
    { id: 'keno:1', timestamp: '2026-09-22T12:01:00-06:00' },
    { id: 'post:2', timestamp: '2026-09-22T17:59:00Z' }
  ];
  assert.deepEqual(sortEntries(entries).map(x => x.id), ['keno:1', 'post:1', 'post:2']);
  assert.equal(entries[0].id, 'post:1');
});
test('posting uses server timestamp, literal text, and preserves Keno entries', async () => {
  let fail = false;
  const { nodes, calls, context } = await load((url, options) => ({
    ok: !fail, status: 503, json: async () => options.method === 'POST' ? [
      { id: 'saved', message: '<img src=x onerror=alert(1)>', created_at: '2026-09-22T18:00:00Z' }
    ] : []
  }));
  const keno = element();
  context.liveFeed.setSource('keno', [{ id: 'keno:1', timestamp: '2026-09-22T17:00:00Z', node: keno }]);
  const input = nodes.get('live-feed-message');
  input.value = '<img src=x onerror=alert(1)>';
  await nodes.get('live-feed-submit').handlers.click();
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { message: '<img src=x onerror=alert(1)>' });
  const entries = nodes.get('live-feed-list').children;
  assert.equal(entries.length, 2);
  assert.equal(entries[1], keno);
  assert.equal(entries[0].children[0].dateTime, '2026-09-22T18:00:00Z');
  assert.match(entries[0].children[0].textContent, /12:00 PM$/);
  assert.equal(entries[0].children[1].children[0].textContent, '📣');
  assert.equal(entries[0].children[1].children[0]['aria-hidden'], 'true');
  assert.equal(entries[0].children[1].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(input.value, '');
  fail = true;
  input.value = 'Keep my message';
  await nodes.get('live-feed-submit').handlers.click();
  assert.equal(input.value, 'Keep my message');
  assert.equal(nodes.get('live-feed-submit').disabled, false);
  assert.match(nodes.get('live-feed-submit-message').textContent, /Could not confirm/);
});
test('only posts from the last 24 hours are requested and shown', async () => {
  const { nodes, calls } = await load(() => ({
    ok: true, json: async () => [
      { id: 'recent', message: 'just now', created_at: '2026-09-22T18:00:00Z' },
      { id: 'edge', message: 'exactly 24h', created_at: '2026-09-21T18:30:00Z' },
      { id: 'old', message: 'yesterday', created_at: '2026-09-21T18:29:59Z' }
    ]
  }));
  const query = new URL(calls[0].url).searchParams;
  assert.equal(query.get('created_at'), 'gte.2026-09-21T18:30:00.000Z');
  const shown = nodes.get('live-feed-list').children.map(node => node.children[1].children[1].textContent);
  assert.deepEqual(shown, ['just now', 'exactly 24h']);
});

test('community posts keep the megaphone; wins get their own icon, label and gold style', () => {
  assert.deepEqual(postView({ kind: null }), { icon: '\u{1F4E3}', className: 'live-event-message live-user-message', label: '' });
  assert.deepEqual(postView({ kind: 'battleship-win' }), { icon: '⚓', className: 'live-event-message live-win-message', label: 'Battleship Keno' });
  assert.equal(postView({ kind: 'arcade-record' }).label, 'Arcade');
  assert.equal(postView({ kind: 'bingo-win' }).label, 'Keno Bingo');
  assert.equal(postView({ kind: 'something-new' }).label, 'Winner');
});

test('win rows render with their label as plain text', async () => {
  const { nodes, calls } = await load(() => ({ ok: true, json: async () => [
    { id: 'w1', message: 'New Beer Pong high score! Ada scored 42.', created_at: '2026-09-22T18:10:00Z', kind: 'arcade-record' }
  ] }));
  assert.match(calls[0].url, /select=id,message,created_at,kind/);
  const message = nodes.get('live-feed-list').children[0].children[1];
  assert.equal(message.className, 'live-event-message live-win-message');
  const [label, , words] = message.children[1].children;
  assert.equal(label.textContent, 'Arcade');
  assert.equal(words.textContent, 'New Beer Pong high score! Ada scored 42.');
});

test('posts still load before the database has the kind column', async () => {
  const { nodes, calls } = await load(url => url.includes(',kind')
    ? { ok: false, status: 400, json: async () => ({}) }
    : { ok: true, json: async () => [{ id: 'p1', message: 'hello', created_at: '2026-09-22T18:10:00Z' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1].url, /kind/);
  assert.equal(nodes.get('live-feed-list').children.length, 1);
  assert.equal(nodes.get('posts-feed-status').textContent, '');
});
