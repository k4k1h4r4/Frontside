(function (root) {
  'use strict';

  function read(search) {
    const params = new URLSearchParams(search);
    if (params.get('destroy') !== '1') return null;
    const rawBalls = (params.get('balls') || '').split(',');
    const balls = rawBalls.map(Number);
    const raceid = Number(params.get('race'));
    if (!Number.isSafeInteger(raceid) || raceid < 1 ||
        rawBalls.length !== 20 || rawBalls.some(value => !/^\d+$/.test(value)) ||
        balls.some(value => !Number.isInteger(value) || value < 1 || value > 80) ||
        new Set(balls).size !== 20) {
      throw new Error('This board snapshot is invalid. Open Keno and choose Destroy this Keno Board again.');
    }
    const game = Number(params.get('game'));
    const timestamp = params.get('time');
    return {
      raceid,
      racenumber: Number.isSafeInteger(game) && game > 0 ? game : null,
      timestamp: timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null,
      balls
    };
  }

  function buildLink(game, origin) {
    const board = new URL('/keno.html', origin);
    board.searchParams.set('destroy', '1');
    board.searchParams.set('race', game.raceid);
    board.searchParams.set('balls', game.balls.join(','));
    if (game.racenumber != null) board.searchParams.set('game', game.racenumber);
    if (game.timestamp) board.searchParams.set('time', game.timestamp);
    // Validate our own payload before offering the link.
    read(board.search);
    const destroy = new URL('https://destroy.spritefusion.com/');
    destroy.searchParams.set('url', board.href);
    return destroy.href;
  }

  const api = { read, buildLink };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KenoSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
