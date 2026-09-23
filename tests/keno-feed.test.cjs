const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, groupByDraw } = require('../keno-feed.js');
function games(hits) {
  return hits.map((hit, i) => ({ raceid: i + 1, balls: hit ? [1] : [], timestamp: '2026-09-22T12:00:00Z' }));
}
function messages(hits, first = 1) {
  return analyze(games(hits), first).events.filter(event => event.id.endsWith(':1'));
}
test('groups hot and cold alerts by draw, retaining game time and separate subsequent draws', () => {
  const events = [
    { raceid: 12, racenumber: 101, timestamp: '2026-09-22T12:05:00Z', kind: 'HOT', message: 'hot' },
    { raceid: 12, racenumber: 101, timestamp: '2026-09-22T12:05:00Z', kind: 'COLD', message: 'cold' },
    { raceid: 11, racenumber: 100, timestamp: '2026-09-22T12:00:00Z', kind: 'COLD', message: 'previous' }
  ];
  const grouped = groupByDraw(events);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].timestamp, events[0].timestamp);
  assert.equal(grouped[0].racenumber, 101);
  assert.deepEqual(grouped[0].alerts, events.slice(0, 2));
  assert.deepEqual(grouped[1].alerts, events.slice(2));
  assert.deepEqual(groupByDraw([]), []);
});
test('hot threshold, successive entries, break and restart', () => {
  const events = messages([false, true, true, true, true, false, true, true, true]);
  assert.deepEqual(events.map(event => event.id), ['4:HOT:1', '5:HOT:1', '9:HOT:1']);
  assert.equal(events[0].title, 'HOT STREAK on 1!');
  assert.equal(events[0].detail, 'Drawn for 3 straight games!');
  assert.equal(events[1].detail, 'Drawn for 4 straight games!');
});
test('cold threshold, successive entries and end', () => {
  const events = messages([true, ...Array(16).fill(false), true]);
  assert.deepEqual(events.map(event => event.id), ['16:COLD:1', '17:COLD:1']);
  assert.equal(events[0].title, 'COLD STREAK on 1!');
  assert.equal(events[0].detail, 'No draws for 15 straight games!');
  assert.equal(events[1].detail, 'No draws for 16 straight games!');
});
test('unknown history never produces an invented exact count', () => {
  assert.equal(messages(Array(30).fill(false)).length, 0);
  assert.equal(messages(Array(30).fill(true)).length, 0);
});
test('lookback establishes counts without publishing older events; repeat evaluation is stable', () => {
  const input = [true, ...Array(20).fill(false)];
  const events = messages(input, 20);
  assert.deepEqual(events.map(event => event.id), ['20:COLD:1', '21:COLD:1']);
  assert.equal(events[0].detail, 'No draws for 19 straight games!');
  assert.deepEqual(messages(input, 20), events);
});
