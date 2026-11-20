/** Authoritative match rules. Runs in Supabase; imported by Node tests. */
export const SPECS = [['Carrier',5],['Battleship',4],['Destroyer',3],['Submarine',3],['Patrol Boat',2]];
export const emptyState = () => ({active:null,lobby:null,recent:[],last:null});
export function validateFleet(input) {
  if(!Array.isArray(input)||input.length!==5)throw Error('Place all five ships.');
  const used=new Set();
  return SPECS.map(([name,length],i)=>{
    const cells=input[i]?.cells;
    if(!Array.isArray(cells)||cells.length!==length||cells.some(n=>!Number.isInteger(n)||n<1||n>80))throw Error('Invalid ship spaces.');
    const a=[...cells].sort((x,y)=>x-y),step=a[1]-a[0];
    if(![1,10].includes(step)||a.some((n,j)=>n!==a[0]+j*step)||(step===1&&Math.floor((a[0]-1)/10)!==Math.floor((a.at(-1)-1)/10)))throw Error('Ships must be straight and inside the board.');
    a.forEach(n=>{if(used.has(n))throw Error('Ships cannot overlap.');used.add(n);});
    return {name,length,cells:a};
  });
}
export function validateDraw(raw,expected) {
  const raceid=Number(raw.raceid),racenumber=Number(raw.racenumber);
  if(!Number.isSafeInteger(raceid)||raceid<1||(expected!=null&&raceid!==expected)||!Number.isSafeInteger(racenumber)||!Number.isFinite(Date.parse(raw.timestamp))||!Array.isArray(raw.balls)||raw.balls.length!==20||new Set(raw.balls).size!==20||raw.balls.some(n=>!Number.isInteger(n)||n<1||n>80))throw Error('Incomplete Keno draw; processing paused.');
  return {raceid,racenumber,timestamp:raw.timestamp,balls:[...raw.balls]};
}
export function sunkCount(p) { return p.fleet.filter(s=>s.cells.every(n=>p.hits.includes(n))).length; }
export function applyBall(match,number,draw,index) {
  const contenders=match.players.filter(p=>!p.eliminated);
  for(const p of contenders){
    if(p.fleet.some(s=>s.cells.includes(number))&&!p.hits.includes(number))p.hits.push(number);
    if(sunkCount(p)>=lossLimit(match.gameMode))p.eliminated={raceid:draw.raceid,racenumber:draw.racenumber,ball:index,number};
  }
  const alive=match.players.filter(p=>!p.eliminated);
  if(alive.length<=1){
    match.status='finished';match.winners=(alive.length?alive:contenders).map(p=>p.id);
    match.finish={raceid:draw.raceid,racenumber:draw.racenumber,ball:index,number,timestamp:draw.timestamp};
    return true;
  }
  return false;
}
export function armLobby(state,now=Date.now()) {
  const lobby=state.lobby;
  if(!lobby||!state.last)return;
  if(lobby.gameMode==='rng'){
    if(lobby.players.length<2){
      lobby.countdownEndsAt=null;lobby.startRaceId=null;lobby.expectedGame=null;
      lobby.extensionRequests=[];
      return;
    }
    if(state.active)return;
    lobby.countdownEndsAt??=new Date(now+60000).toISOString();
    lobby.startRaceId=state.last.raceid+1;
    lobby.expectedGame=state.last.racenumber+1;
    return;
  }
  if(state.active||lobby.startRaceId)return;
  lobby.startRaceId=state.last.raceid+1;
  lobby.expectedGame=state.last.racenumber+1;
}
export function advance(state,draw) {
  if(state.last&&draw.raceid<=state.last.raceid)return;
  if(state.last&&draw.raceid!==state.last.raceid+1)throw Error('Missing draw; refusing to skip history.');
  state.last={raceid:draw.raceid,racenumber:draw.racenumber,timestamp:draw.timestamp};
  if(!state.active&&state.lobby?.startRaceId===draw.raceid&&
    (state.lobby.gameMode!=='rng'||Date.parse(draw.timestamp)>=Date.parse(state.lobby.countdownEndsAt))){
    if(state.lobby.players.length>=2){
      state.active={...state.lobby,status:'active',startGame:draw.racenumber,history:[]};state.lobby=null;
    }else{
      state.lobby.startRaceId=null;state.lobby.cutoff=null;state.lobby.expectedGame=null;
    }
  }
  const match=state.active;
  if(match){
    const applied={...draw,balls:[]};
    for(let i=0;i<draw.balls.length;i++){
      applied.balls.push(draw.balls[i]);
      if(applyBall(match,draw.balls[i],draw,i+1))break;
    }
    match.history.push(applied);
    if(match.status==='finished'){
      state.recent.unshift(match);state.recent=state.recent.slice(0,20);state.active=null;
    }
  }
  // A queued match never consumes the remainder of the deciding draw.
  armLobby(state,Date.parse(draw.timestamp));
}
export function joinLobby(state,{id,name,fleet,gameMode='live-2'},now,newId) {
  validateMode(gameMode);
  pruneLobby(state,now);
  name=String(name??'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>30||/[<>\x00-\x1f]/.test(name))throw Error('Use a name between 2 and 30 characters.');
  const existing=state.lobby?.players.find(p=>p.id===id);
  if(existing)return; // Idempotent retry: locked fleets can never be rewritten.
  if(state.active?.players.some(p=>p.id===id&&!p.eliminated))throw Error('You already have an active fleet.');
  const validated=validateFleet(fleet);
  if(!state.last)throw Error('Keno feed not ready. Try again shortly.');
  if(!state.lobby)state.lobby={id:newId,status:'lobby',gameMode,createdAt:new Date(now).toISOString(),startRaceId:null,expectedGame:null,cutoff:null,players:[]};
  if(state.lobby.players.length>=100)throw Error('This lobby is full.');
  if(state.lobby.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw Error('That name is already in this lobby. Add an initial.');
  state.lobby.players.push({id,name,fleet:validated,hits:[],eliminated:null,joinedAt:new Date(now).toISOString()});
  armLobby(state,now);
}
export function publicState(state,uid,allState=state){
  const result=structuredClone(state);
  delete result.games;
  // Do not reveal other players' placements before play starts.
  if(result.lobby)for(const p of result.lobby.players)if(p.id!==uid)p.fleet=[];
  const recent=[...(allState.recent||[]),...Object.values(allState.games||{}).flatMap(lane=>lane.recent||[])];
  recent.sort((a,b)=>(Date.parse(b.finish?.timestamp)||0)-(Date.parse(a.finish?.timestamp)||0));
  result.recent=recent.slice(0,20).map(m=>({id:m.id,gameMode:m.gameMode||'live-2',drawCount:m.history?.length??m.drawCount??0,status:m.status,players:m.players.map(p=>({id:p.id,name:p.name})),winners:m.winners,startGame:m.startGame,finish:m.finish}));
  return result;
}

export const GAME_MODES = ['live-1','live-2','rng'];
export function validateMode(mode) {
  if(!GAME_MODES.includes(mode))throw Error('Choose a valid game mode.');
  return mode;
}
export function lossLimit(mode='live-2') {
  validateMode(mode);
  return mode==='rng'?5:mode==='live-1'?1:2;
}
// Keep the original live-2 state in place so existing matches survive deployment.
export function gameState(state,mode) {
  validateMode(mode);
  if(mode==='live-2')return state;
  state.games??={};
  return state.games[mode]??=(emptyState());
}
export function pruneLobby(state,now) {
  if(!state.lobby)return false;
  const before=state.lobby.players.length;
  state.lobby.players=state.lobby.players.filter(p=>{
    const joined=Date.parse(p.joinedAt||state.lobby.createdAt);
    return Number.isFinite(joined)&&now-joined<=60*60*1000;
  });
  if(!state.lobby.players.length)state.lobby=null;
  else if(state.lobby.gameMode==='rng'&&state.lobby.players.length<2){
    state.lobby.countdownEndsAt=null;state.lobby.startRaceId=null;state.lobby.expectedGame=null;
    state.lobby.extensionRequests=[];
  }
  return before!==(state.lobby?.players.length||0);
}
// Rejection sampling avoids modulo bias. The browser never supplies random balls.
export function randomInt(max) {
  const value=new Uint32Array(1),limit=2**32-(2**32%max);
  do{crypto.getRandomValues(value);}while(value[0]>=limit);
  return value[0]%max;
}
export function simulatedDraw(slot,pick=randomInt) {
  const pool=Array.from({length:80},(_,i)=>i+1);
  for(let i=0;i<20;i++){
    const j=i+pick(80-i);
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return {raceid:slot,racenumber:slot,timestamp:new Date(slot*30000).toISOString(),balls:pool.slice(0,20)};
}
export function advanceSimulation(state,now,drawFor=simulatedDraw) {
  if(!state.last){
    const slot=Math.floor(now/30000);
    state.last={raceid:slot,racenumber:slot,timestamp:new Date(slot*30000).toISOString()};
  }
  armLobby(state,now);
  if(!state.active){
    state.nextDrawAt=state.lobby?.countdownEndsAt||null;
    if(!state.nextDrawAt){
      const slot=Math.max(state.last.raceid,Math.floor(now/30000));
      state.last={raceid:slot,racenumber:slot,timestamp:new Date(slot*30000).toISOString()};
      return true;
    }
  }else{
    // Recover older RNG matches without changing their already-persisted draws.
    state.nextDrawAt??=new Date(Date.parse(state.active.history?.at(-1)?.timestamp||state.last.timestamp)+30000).toISOString();
  }
  let processed=0;
  while(state.nextDrawAt&&Date.parse(state.nextDrawAt)<=now&&processed<120){
    const due=Date.parse(state.nextDrawAt);
    const draw={...drawFor(state.last.raceid+1),timestamp:new Date(due).toISOString()};
    advance(state,draw);
    state.nextDrawAt=state.active?new Date(due+30000).toISOString():state.lobby?.countdownEndsAt||null;
    processed++;
  }
  return !state.nextDrawAt||Date.parse(state.nextDrawAt)>now;
}
export function extendLobby(state,{id,matchId,requestId},now) {
  const lobby=state.lobby;
  if(!lobby||lobby.id!==matchId||lobby.gameMode!=='rng'||!lobby.players.some(p=>p.id===id))
    throw Error('Only Captains in this RNG lobby can extend its countdown.');
  if(typeof requestId!=='string'||!requestId||requestId.length>80)throw Error('Invalid extension request.');
  lobby.extensionRequests??=[];
  if(lobby.extensionRequests.some(r=>r.id===id&&r.requestId===requestId))return;
  const ends=Date.parse(lobby.countdownEndsAt);
  if(state.active||lobby.players.length<2||!Number.isFinite(ends)||now>=ends)
    throw Error('The lobby countdown is no longer open.');
  lobby.countdownEndsAt=new Date(ends+60000).toISOString();
  state.nextDrawAt=lobby.countdownEndsAt;
  lobby.extensionRequests.push({id,requestId});
  lobby.extensionRequests=lobby.extensionRequests.slice(-100);
}
