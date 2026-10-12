const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../keno.html'), 'utf8');
const apiScript = html.match(/<script id="keno-snapshot-api">([\s\S]*?)<\/script>/)[1];
const apiModule = { exports: {} };
new Function('module', apiScript)(apiModule);
const snapshot = apiModule.exports;

const game = {
  raceid: 12345, racenumber: 806, timestamp: '2026-10-12T17:54:00Z',
  balls: [16, 3, 52, 24, 31, 47, 53, 32, 22, 30, 12, 54, 9, 46, 78, 76, 75, 77, 79, 80]
};
function search(data = game) {
  return new URL(new URL(snapshot.buildLink(data, 'https://frontsidebar.com')).searchParams.get('url')).search;
}

test('nested URL preserves all balls, selected race, game number, and timestamp', () => {
  assert.deepEqual(snapshot.read(search()), game);
  const historical = { ...game, raceid: 12000, racenumber: 700 };
  assert.deepEqual(snapshot.read(search(historical)), historical);
  assert.equal(snapshot.read('?heatmap=1'), null);
});

test('rejects partial, duplicate, out-of-range, non-integer, and invalid-race snapshots', () => {
  for (const balls of [game.balls.slice(0, 12), Array(20).fill(3), [...game.balls.slice(1), 81], [...game.balls.slice(1), 2.5]]) {
    assert.throws(() => snapshot.buildLink({ ...game, balls }, 'https://frontsidebar.com'));
  }
  assert.throws(() => snapshot.read(search().replace('race=12345', 'race=0')));
  assert.throws(() => snapshot.read('?destroy=1'));
});

function pageContext(query) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      children: [], dataset: {}, style: {}, hidden: true, textContent: '',
      classList: {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value),
        toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value)
      },
      appendChild(child) { this.children.push(child); },
      removeAttribute(name) { delete this[name]; }
    };
  }
  const document = {
    body: element(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    querySelectorAll(selector) {
      if (selector === '.keno-cell') return ['section-low', 'section-high'].flatMap(id => this.getElementById(id).children);
      return [];
    },
    querySelector(selector) {
      const match = selector.match(/^\.(keno-cell|draw-ball)\[data-num="(\d+)"\]$/);
      if (!match) return null;
      const candidates = match[1] === 'keno-cell' ? this.querySelectorAll('.keno-cell') : this.getElementById('draw-order').children;
      return candidates.find(cell => Number(cell.dataset.num) === Number(match[2]));
    }
  };
  const context = vm.createContext({
    document, window: { location: { search: query, origin: 'https://frontsidebar.com' } },
    URL, URLSearchParams,
    fetch() { throw new Error('Snapshot must not fetch game data'); },
    setTimeout() { throw new Error('Snapshot must not animate'); },
    setInterval() { throw new Error('Snapshot must not poll'); }
  });
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInContext(apiScript, context);
  vm.runInContext(script, context);
  return { document, context };
}

test('actual page startup highlights exactly the supplied 20 balls synchronously without requests or timers', () => {
  const { document } = pageContext(search() + '&heatmap=1');
  const cells = document.querySelectorAll('.keno-cell');
  assert.equal(cells.length, 80);
  assert.deepEqual(cells.filter(cell => cell.classList.contains('drawn')).map(cell => Number(cell.dataset.num)).sort((a, b) => a - b), [...game.balls].sort((a, b) => a - b));
  assert.equal(document.getElementById('draw-order').children.filter(ball => ball.classList.contains('active')).length, 20);
  assert.equal(document.getElementById('game-number').textContent, 'Game #806');
  assert.equal(document.getElementById('status-text').textContent, 'Snapshot');
});

test('invalid snapshot reports an error and never loads a different game', () => {
  const { document } = pageContext('?destroy=1&race=12345&balls=1,2,3');
  assert.equal(document.querySelectorAll('.keno-cell').filter(cell => cell.classList.contains('drawn')).length, 0);
  assert.match(document.getElementById('error-msg').textContent, /snapshot is invalid/);
  assert.equal(document.getElementById('destroy-board-link').hidden, true);
});
