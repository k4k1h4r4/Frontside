import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSimulation,
  extendLobby,
  gameState,
  lossLimit,
  pruneLobby,
  simulatedDraw,
  advance,
  applyBall,
  emptyState,
  joinLobby,
  lobbySummary,
  fleetModes,
  newWins,
  recentIds,
  winMessage,
  publicState,
  validateDraw,
  validateFleet
} from '../supabase/functions/battleship/engine.mjs';

const placements = [
  [1, 2, 3, 4, 5],
  [11, 12, 13, 14],
  [21, 22, 23],
  [31, 32, 33],
  [41, 42]
];

function fleet(offset = 0) {
  const names = ['Carrier', 'Battleship', 'Destroyer', 'Submarine', 'Patrol Boat'];
  return placements.map((cells, index) => ({
    name: names[index],
    length: cells.length,
    cells: cells.map(number => number + offset)
  }));
}

function player(id, offset = 0) {
  return { id, name: id, fleet: fleet(offset), hits: [], eliminated: null };
}

function draw(raceid, racenumber, balls) {
  return {
    raceid,
    racenumber,
    timestamp: '2026-09-30T10:00:00-06:00',
    balls: [...balls, ...Array.from({ length: 80 }, (_, i) => i + 1)
      .filter(number => !balls.includes(number))].slice(0, 20)
  };
}

test('validates the 5/4/3/3/2 fleet and rejects overlaps', () => {
  assert.deepEqual(validateFleet(fleet()).map(ship => ship.length), [5, 4, 3, 3, 2]);
  const invalid = fleet();
  invalid[1].cells = [2, 3, 4, 5];
  assert.throws(() => validateFleet(invalid), /overlap/);
});

test('first fleet arms the next draw and later fleets may join until it arrives', () => {
  const state = emptyState();
  state.last = { raceid: 433, racenumber: 433, timestamp: '2026-09-30T10:00:00-06:00' };
  joinLobby(state, { id: 'one', name: 'One', fleet: fleet() }, Date.now(), 'match-1');
  assert.equal(state.lobby.startRaceId, 434);
  joinLobby(state, { id: 'two', name: 'Two', fleet: fleet(5) }, Date.now(), 'unused');
  assert.equal(state.lobby.players.length, 2);
  advance(state, draw(434, 434, Array.from({ length: 20 }, (_, i) => 60 + i)));
  assert.equal(state.active.startRaceId, 434);
  assert.equal(state.active.startGame, 434);
  assert.equal(state.active.history.length, 1);
});

test('a solo lobby waits and rolls its start to the following draw', () => {
  const state = emptyState();
  state.last = { raceid: 433, racenumber: 433, timestamp: '2026-09-30T10:00:00-06:00' };
  joinLobby(state, { id: 'one', name: 'One', fleet: fleet() }, Date.now(), 'match-1');
  advance(state, draw(434, 434, [80]));
  assert.equal(state.active, null);
  assert.equal(state.lobby.startRaceId, 435);
  assert.equal(state.lobby.players.length, 1);
});

test('an upcoming lobby waits while one match is active, then arms the following draw', () => {
  const state = emptyState();
  state.last = { raceid: 700, racenumber: 20, timestamp: '2026-09-30T10:00:00-06:00' };
  state.active = {
    id: 'active', status: 'active', startGame: 19, history: [], winners: [],
    players: [player('one'), player('two', 5)]
  };
  // Put both active players one ball away from elimination.
  state.active.players[0].hits.push(1, 2, 3, 4, 5, 41);
  state.active.players[1].hits.push(6, 7, 8, 9, 10, 46);
  joinLobby(state, { id: 'three', name: 'Three', fleet: fleet() }, Date.now(), 'queued');
  joinLobby(state, { id: 'four', name: 'Four', fleet: fleet(5) }, Date.now(), 'unused');
  assert.equal(state.lobby.startRaceId, null);
  advance(state, draw(701, 21, [42]));
  assert.equal(state.active, null);
  assert.equal(state.lobby.startRaceId, 702);
  assert.equal(state.recent[0].winners[0], 'two');
});

test('a player with an active fleet cannot enter the upcoming lobby', () => {
  const state = emptyState();
  state.last = { raceid: 800, racenumber: 30, timestamp: '2026-09-30T10:00:00-06:00' };
  state.active = { id: 'active', status: 'active', history: [], players: [player('one'), player('two', 5)] };
  assert.throws(
    () => joinLobby(state, { id: 'one', name: 'One', fleet: fleet() }, Date.now(), 'queued'),
    /already have an active fleet/
  );
});

test('the second sunk ship eliminates a player and draw order stops at one survivor', () => {
  const match = {
    id: 'match-1',
    status: 'active',
    players: [player('one'), player('two', 5)],
    winners: [],
    history: []
  };
  const game = draw(500, 500, [41, 42, 46, 47]);
  match.players[0].hits.push(1, 2, 3, 4, 5);
  match.players[1].hits.push(6, 7, 8, 9, 10);
  assert.equal(applyBall(match, 41, game, 1), false);
  assert.equal(match.players[0].eliminated, null);
  assert.equal(applyBall(match, 42, game, 2), true);
  assert.deepEqual(match.winners, ['two']);
  assert.equal(match.finish.ball, 2);
  assert.equal(match.finish.number, 42);
});

test('public lobby state hides opponents fleets but preserves the caller fleet', () => {
  const state = emptyState();
  state.lobby = { id: 'm', players: [player('one'), player('two', 5)] };
  const visible = publicState(state, 'one');
  assert.equal(visible.lobby.players[0].fleet.length, 5);
  assert.deepEqual(visible.lobby.players[1].fleet, []);
});

test('draw validation preserves ball order and rejects duplicates', () => {
  const valid = draw(600, 20, [75, 42, 76]);
  assert.deepEqual(validateDraw(valid, 600).balls, valid.balls);
  valid.balls[1] = valid.balls[0];
  assert.throws(() => validateDraw(valid, 600), /Incomplete/);
});

for(const mode of ['live-1','live-2','rng']){
  test(`${mode} eliminates at exactly the configured number of sunk ships`,()=>{
    const limit=lossLimit(mode);
    const match={gameMode:mode,status:'active',players:[player('one'),player('two',5)],winners:[]};
    const target=match.players[0];
    const cells=target.fleet.slice(0,limit).flatMap(s=>s.cells);
    target.hits=cells.slice(0,-1);
    const ball=cells.at(-1),game=draw(900,1,[ball]);
    assert.equal(target.eliminated,null);
    assert.equal(applyBall(match,ball,game,1),true);
    assert.ok(target.eliminated);
    assert.deepEqual(match.winners,['two']);
  });
  test(`${mode} requires all five ships`,()=>{
    const state=emptyState();state.last={raceid:1,racenumber:1};
    assert.throws(()=>joinLobby(state,{id:'one',name:'One',fleet:fleet().slice(0,4),gameMode:mode},0,'m'),/all five/);
  });
}

test('RNG keeps captains alive after four ships have sunk',()=>{
  const match={gameMode:'rng',status:'active',players:[player('one'),player('two',5)],winners:[]};
  const cells=match.players[0].fleet.slice(0,4).flatMap(s=>s.cells);
  for(const [i,ball]of cells.entries())assert.equal(applyBall(match,ball,draw(1,1,[ball]),i+1),false);
  assert.equal(match.players[0].eliminated,null);
});

test('game lanes are independent and legacy live-2 matches stay in place',()=>{
  const state=emptyState(),now=1800000000000;
  state.last={raceid:1,racenumber:1};
  const one=gameState(state,'live-1'),rng=gameState(state,'rng');
  one.last={raceid:1,racenumber:1};advanceSimulation(rng,now);
  for(const mode of ['live-1','live-2','rng'])joinLobby(gameState(state,mode),{id:'one',name:'One',fleet:fleet(),gameMode:mode},now,mode);
  assert.equal(gameState(state,'live-2'),state);
  assert.equal(one.lobby.gameMode,'live-1');assert.equal(rng.lobby.gameMode,'rng');
  assert.equal(state.lobby.gameMode,'live-2');
  assert.equal(publicState(state,'one').games,undefined);
  assert.throws(()=>gameState(state,'invalid'),/valid game mode/);
});

test('stale entries expire after one hour without removing newer captains',()=>{
  const now=1800000000000,state=emptyState();state.last={raceid:1,racenumber:1};
  joinLobby(state,{id:'old',name:'Old',fleet:fleet()},now-3600001,'m');
  joinLobby(state,{id:'new',name:'New',fleet:fleet(5)},now-3600000,'m');
  pruneLobby(state,now);
  assert.deepEqual(state.lobby.players.map(p=>p.id),['new']);
  assert.equal(pruneLobby(state,now+1),true);assert.equal(state.lobby,null);
});

test('expired entries cannot start a battle and may rejoin with a new fleet',()=>{
  const now=1800000000000,state=emptyState();state.last={raceid:1,racenumber:1};
  joinLobby(state,{id:'one',name:'One',fleet:fleet()},now-3600001,'m');
  joinLobby(state,{id:'two',name:'Two',fleet:fleet(5)},now,'new');
  assert.deepEqual(state.lobby.players.map(p=>p.id),['two']);
  advance(state,draw(2,2,[80]));assert.equal(state.active,null);
  joinLobby(state,{id:'one',name:'One',fleet:fleet()},now,'m');
  assert.equal(state.lobby.players.length,2);
});

test('simulated draws contain 20 unique balls from 1 through 80',()=>{
  for(let i=0;i<100;i++){
    const game=simulatedDraw(100+i);
    assert.equal(game.balls.length,20);assert.equal(new Set(game.balls).size,20);
    assert.ok(game.balls.every(n=>Number.isInteger(n)&&n>=1&&n<=80));
    assert.equal(Date.parse(game.timestamp),(100+i)*30000);
  }
});

function rngLobby(start=1800000001234){
  const state=emptyState();advanceSimulation(state,start);
  for(const [id,offset]of [['one',0],['two',5]])joinLobby(state,{id,name:id,fleet:fleet(offset),gameMode:'rng'},start,id);
  return state;
}
const safeSimulation=slot=>({...draw(slot,slot,Array.from({length:20},(_,i)=>i+60))});

test('RNG waits a full 60 seconds after the second fleet, then draws exactly every 30 seconds',()=>{
  const start=1800000001234,state=rngLobby(start);
  assert.equal(Date.parse(state.lobby.countdownEndsAt),start+60000);
  advanceSimulation(state,start+59999,safeSimulation);assert.equal(state.active,null);
  advanceSimulation(state,start+60000,safeSimulation);assert.equal(state.active.history.length,1);
  assert.equal(Date.parse(state.active.history[0].timestamp),start+60000);
  advanceSimulation(state,start+89999,safeSimulation);assert.equal(state.active.history.length,1);
  advanceSimulation(state,start+90000,safeSimulation);assert.equal(state.active.history.length,2);
  advanceSimulation(state,start+300000,safeSimulation);assert.equal(state.active.history.length,9);
  const times=state.active.history.map(d=>Date.parse(d.timestamp));
  times.slice(1).forEach((n,i)=>assert.equal(n-times[i],30000));
  advanceSimulation(state,start+300000,safeSimulation);assert.equal(state.active.history.length,9);
});

test('a third captain can join during the countdown without resetting it',()=>{
  const start=1800000001234,state=rngLobby(start),deadline=state.lobby.countdownEndsAt;
  joinLobby(state,{id:'three',name:'Three',fleet:fleet(),gameMode:'rng'},start+45000,'unused');
  assert.equal(state.lobby.countdownEndsAt,deadline);
  advanceSimulation(state,start+60000,safeSimulation);assert.equal(state.active.players.length,3);
});

test('locked captains can extend by 60 seconds and duplicate requests do not add time twice',()=>{
  const start=1800000001234,state=rngLobby(start);
  const request={id:'one',matchId:state.lobby.id,requestId:'request-1'};
  extendLobby(state,request,start+10000);
  assert.equal(Date.parse(state.lobby.countdownEndsAt),start+120000);
  extendLobby(state,request,start+11000);assert.equal(Date.parse(state.lobby.countdownEndsAt),start+120000);
  extendLobby(state,{...request,requestId:'request-2'},start+12000);
  extendLobby(state,{...request,id:'two',requestId:'request-3'},start+13000);
  assert.equal(Date.parse(state.lobby.countdownEndsAt),start+240000);
  advanceSimulation(state,start+239999,safeSimulation);assert.equal(state.active,null);
  advanceSimulation(state,start+240000,safeSimulation);assert.equal(state.active.history.length,1);
});

test('spectators, wrong lobbies, live modes and expired countdowns cannot be extended',()=>{
  const start=1800000001234,state=rngLobby(start),matchId=state.lobby.id;
  assert.throws(()=>extendLobby(state,{id:'outsider',matchId,requestId:'a'},start+1000),/Only Captains/);
  assert.throws(()=>extendLobby(state,{id:'one',matchId:'old',requestId:'a'},start+1000),/Only Captains/);
  assert.throws(()=>extendLobby(state,{id:'one',matchId,requestId:'a'},start+60000),/no longer open/);
  state.lobby.gameMode='live-2';
  assert.throws(()=>extendLobby(state,{id:'one',matchId,requestId:'a'},start+1000),/Only Captains/);
});

test('falling below two captains cancels the countdown; a replacement starts a fresh minute',()=>{
  const start=1800000001234,state=rngLobby(start);
  state.lobby.players[0].joinedAt=new Date(start-3600000).toISOString();
  pruneLobby(state,start+1000);assert.equal(state.lobby.countdownEndsAt,null);
  advanceSimulation(state,start+120000,safeSimulation);assert.equal(state.active,null);
  joinLobby(state,{id:'three',name:'Three',fleet:fleet(),gameMode:'rng'},start+121000,'m');
  assert.equal(Date.parse(state.lobby.countdownEndsAt),start+181000);
});

test('queued RNG lobby receives a full countdown after the active match finishes',()=>{
  const start=1800000001234,state=rngLobby(start);
  advanceSimulation(state,start+60000,safeSimulation);
  for(const id of ['three','four'])joinLobby(state,{id,name:id,fleet:fleet(),gameMode:'rng'},start+61000,id);
  assert.equal(state.lobby.countdownEndsAt,null);
  const target=state.active.players[0];target.hits=target.fleet.flatMap(s=>s.cells).slice(0,-1);
  advanceSimulation(state,start+90000,slot=>draw(slot,slot,[42]));
  assert.equal(state.active,null);assert.equal(Date.parse(state.lobby.countdownEndsAt),start+150000);
  advanceSimulation(state,start+149999,safeSimulation);assert.equal(state.active,null);
  advanceSimulation(state,start+150000,safeSimulation);assert.deepEqual(state.active.players.map(p=>p.id),['three','four']);
});

test('all captains eliminated on the same ball share the win in every mode',()=>{
  for(const mode of ['live-1','live-2','rng']){
    const match={gameMode:mode,status:'active',players:[player('one'),player('two')],winners:[]};
    const cells=match.players[0].fleet.slice(0,lossLimit(mode)).flatMap(s=>s.cells);
    for(const p of match.players)p.hits=cells.slice(0,-1);
    applyBall(match,cells.at(-1),draw(1,1,[cells.at(-1)]),1);
    assert.deepEqual(match.winners,['one','two']);
  }
});

test('public recent results combine all modes, classify legacy games and retain simulated draw counts',()=>{
  const root=emptyState();
  const summary={status:'finished',players:[{id:'one',name:'One'}],winners:['one'],startGame:10};
  root.recent=[{...summary,id:'legacy',finish:{racenumber:12,timestamp:'2026-11-18T12:00:00Z'}}];
  gameState(root,'live-1').recent=[{...summary,id:'one',gameMode:'live-1',finish:{racenumber:12,timestamp:'2026-11-18T13:00:00Z'}}];
  gameState(root,'rng').recent=[{...summary,id:'rng',gameMode:'rng',history:[{}, {}, {}],finish:{racenumber:12,timestamp:'2026-11-18T14:00:00Z'}}];
  const recent=publicState(gameState(root,'rng'),'one',root).recent;
  assert.deepEqual(recent.map(m=>m.id),['rng','one','legacy']);
  assert.equal(recent[0].drawCount,3);assert.equal(recent[2].gameMode,'live-2');
  assert.equal(recent[0].history,undefined);
});

test('public lobby summary reports counts per mode without names, fleets or changes to saved state',()=>{
  const now=1800000000000,state=emptyState();state.last={raceid:1,racenumber:1};
  // live-2: two current captains plus one expired entry
  joinLobby(state,{id:'old-id',name:'Oldtimer',fleet:fleet()},now-3600001,'a');
  joinLobby(state,{id:'ada-id',name:'Ada',fleet:fleet(5)},now,'a');
  joinLobby(state,{id:'bo-id',name:'Bo',fleet:fleet(10)},now,'a');
  // rng: two captains start the shared countdown
  const rng=gameState(state,'rng');advanceSimulation(rng,now);
  joinLobby(rng,{id:'cy-id',name:'Cy',fleet:fleet(),gameMode:'rng'},now,'r');
  joinLobby(rng,{id:'di-id',name:'Di',fleet:fleet(5),gameMode:'rng'},now,'r');
  // live-1: a running battle with one captain already eliminated
  const one=gameState(state,'live-1');
  one.active={id:'m',status:'active',gameMode:'live-1',players:[player('ed'),{...player('fay',5),eliminated:{raceid:2}},player('gus',10)]};
  const before=JSON.stringify(state);
  const summary=lobbySummary(state,now);
  assert.deepEqual(summary['live-2'],{battle:null,lobby:{captains:2,startsAt:null,expectedGame:2}});
  assert.equal(summary.rng.lobby.captains,2);
  assert.equal(summary.rng.lobby.startsAt,new Date(now+60000).toISOString());
  assert.deepEqual(summary['live-1'],{battle:{captains:2},lobby:null});
  const text=JSON.stringify(summary);
  for(const secret of ['Oldtimer','Ada','Bo','Cy','ada-id','fleet','cells','hits'])assert.ok(!text.includes(secret),`summary leaked ${secret}`);
  assert.equal(JSON.stringify(state),before,'saved state must not change');
});

test('public lobby summary is empty when nothing is happening',()=>{
  const summary=lobbySummary(emptyState(),1800000000000);
  for(const mode of ['live-1','live-2','rng'])assert.deepEqual(summary[mode],{battle:null,lobby:null});
});

test('a finished match becomes exactly one Live feed win, worded for its mode',()=>{
  const state=emptyState();state.last={raceid:1,racenumber:1,timestamp:'2026-09-30T10:00:00-06:00'};
  state.active={id:'match-1',status:'active',gameMode:'live-2',startGame:2,history:[],
    players:[{...player('a'),name:'Ann'},{...player('b',5),name:'Bo'}]};
  const before=recentIds(state);
  // Bo's carrier (6-10) and battleship (16-19) sink: two ships, so Ann wins.
  advance(state,draw(2,2,[6,7,8,9,10,16,17,18,19]));
  assert.equal(state.recent[0].status,'finished');
  assert.deepEqual(newWins(before,state),[{id:'match-1',message:'Ann won Battleship Keno! (Live Keno · 2 ships)'}]);
  assert.deepEqual(newWins(recentIds(state),state),[],'the same match is never posted twice');
});

test('shared wins name every winner',()=>{
  const players=[{id:'a',name:'Ann'},{id:'b',name:'Bo'},{id:'c',name:'Cy'}];
  assert.equal(winMessage({gameMode:'rng',players,winners:['a','b','c']}),'Ann, Bo and Cy share the Battleship Keno win! (Simulated draws)');
  assert.equal(winMessage({gameMode:'live-1',players,winners:['a','c']}),'Ann and Cy share the Battleship Keno win! (Live Keno · 1 ship)');
  assert.equal(winMessage({players,winners:[]}),'');
});

test('fleet lookup lists lobbies and running battles where this captain is still afloat',()=>{
  const now=1800000000000,state=emptyState();state.last={raceid:1,racenumber:1};
  joinLobby(state,{id:'me',name:'Me',fleet:fleet()},now,'a');
  const one=gameState(state,'live-1');
  one.active={id:'m',status:'active',gameMode:'live-1',players:[player('me'),player('you',5)]};
  const rng=gameState(state,'rng');
  rng.active={id:'r',status:'active',gameMode:'rng',players:[{...player('me'),eliminated:{raceid:3}},player('you',5)]};
  assert.deepEqual(fleetModes(state,'me'),[{mode:'live-1',where:'battle'},{mode:'live-2',where:'lobby'}]);
  assert.deepEqual(fleetModes(state,'you'),[{mode:'live-1',where:'battle'},{mode:'rng',where:'battle'}]);
  assert.deepEqual(fleetModes(state,'nobody'),[]);
  assert.deepEqual(fleetModes(state,''),[]);
});
