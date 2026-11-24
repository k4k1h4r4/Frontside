const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the browser script with a hidden page, so it exports describeBattle
// without fetching anything.
function load() {
  const module = { exports: {} };
  const context = {
    module,
    setInterval() {},
    document: { visibilityState: 'hidden', getElementById: () => null, addEventListener() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'happening-now.js'), 'utf8'), context);
  return module.exports;
}

const { describeBattle: raw } = load();
// Objects from the script's sandbox have a different prototype; compare plain copies.
const describeBattle = (modes) => JSON.parse(JSON.stringify(raw(modes)));
const empty = { battle: null, lobby: null };

test('nothing happening keeps the invitation', () => {
  assert.deepEqual(describeBattle({ 'live-1': empty, 'live-2': empty, rng: empty }),
    { text: 'Captains wanted', mode: null, live: false });
  assert.equal(describeBattle(undefined).text, 'Captains wanted');
});

test('ready captains are added up across modes and link to the busiest lobby', () => {
  const view = describeBattle({
    'live-1': { battle: null, lobby: { captains: 1 } },
    'live-2': empty,
    rng: { battle: { captains: 4 }, lobby: { captains: 2 } }
  });
  assert.deepEqual(view, { text: '3 captains ready', mode: 'rng', live: true });
});

test('one ready captain reads naturally; ties favor the default live-2 mode', () => {
  assert.equal(describeBattle({ 'live-2': { battle: null, lobby: { captains: 1 } } }).text, '1 captain ready');
  const tie = describeBattle({ 'live-1': { lobby: { captains: 2 } }, 'live-2': { lobby: { captains: 2 } } });
  assert.equal(tie.mode, 'live-2');
});

test('a running battle shows how many captains are still afloat', () => {
  const view = describeBattle({ 'live-1': { battle: { captains: 3 }, lobby: null }, 'live-2': empty, rng: empty });
  assert.deepEqual(view, { text: 'Battle on · 3 left', mode: 'live-1', live: true });
});
