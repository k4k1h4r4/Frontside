const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function page(search='',{legacy=false,beforeResponse=null,uid='me',sharedLanes=null,archivedMatches=new Map(),reportFleets=false,savedMode=null}={}){
  const nodes=new Map(),requests=[],saved=new Map(),lanes=sharedLanes||new Map(),timers=new Map();let nextTimer=1;
  if(savedMode)saved.set('battleship:gameMode',savedMode);
  class Element{
    constructor(id=''){
      this.id=id;this.className='';this.dataset={};this.children=[];this.value='';this.hidden=false;
      this.style={setProperty(){}};this.firstElementChild={style:{}};
      this.offsetLeft=0;this.offsetTop=0;this.offsetWidth=30;this.offsetHeight=30;
      this.classList={add:c=>{this.className+=' '+c;},toggle:(c,on)=>{
        const classes=new Set(this.className.split(' ').filter(Boolean));
        if(on)classes.add(c);else classes.delete(c);this.className=[...classes].join(' ');
      }};
    }
    append(...items){this.children.push(...items);for(const n of items)if(n.id)nodes.set(n.id,n);}
    replaceChildren(...items){this.children=[];this.append(...items);}
    setAttribute(){} addEventListener(){} querySelectorAll(){return [];} focus(){} scrollIntoView(){}
    showModal(){this.open=true;} close(){this.open=false;}
  }
  const html=fs.readFileSync('battleship.html','utf8');
  for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set(id,new Element(id));
  const board=new Element();
  const document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id)||null,querySelector:s=>s==='.keno-board-wrap'?board:null,createElement:()=>new Element(),addEventListener(){}};
  const session={access_token:'test',user:{id:uid}};
  const client={auth:{getSession:async()=>({data:{session}})}};
  const context=vm.createContext({document,location:{search},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},window:{supabase:{createClient:()=>client},addEventListener(){}},ResizeObserver:class{observe(){}},URLSearchParams,AbortController,AbortSignal,structuredClone,Date,crypto:require('node:crypto').webcrypto,console,setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),setInterval(){},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    let state=lanes.get(body.gameMode)||{active:null,lobby:null,recent:[],last:null};
    if(body.action==='join'){
      const player={id:uid,name:body.name,fleet:body.fleet,hits:[],eliminated:null};
      state={...state,lobby:state.lobby?{...state.lobby,players:[...state.lobby.players,player]}:{id:'match-'+body.gameMode,gameMode:body.gameMode,status:'lobby',players:[player]}};
      if(body.gameMode==='rng'&&state.lobby.players.length>=2)state.lobby.countdownEndsAt??=new Date(Date.now()+60000).toISOString();
      lanes.set(body.gameMode,state);
    }
    if(body.action==='extend')state.lobby.countdownEndsAt=new Date(Date.parse(state.lobby.countdownEndsAt)+60000).toISOString();
    const replyState=structuredClone(state);
    if(beforeResponse)await beforeResponse(body);
    // The updated server lists the modes holding this captain's fleet.
    const fleets=[];
    for(const [mode,lane] of lanes){
      if(lane.active?.players.some(p=>p.id===uid&&!p.eliminated))fleets.push({mode,where:'battle'});
      else if(lane.lobby?.players.some(p=>p.id===uid))fleets.push({mode,where:'lobby'});
    }
    return {ok:true,json:async()=>({...(!legacy?{gameMode:body.gameMode,rulesVersion:2}:{}),...(reportFleets?{fleets}:{}),uid,state:replyState,match:archivedMatches.get(body.matchId),caughtUp:true,warning:'',serverTime:new Date().toISOString()})};
  }});
  vm.runInContext(fs.readFileSync('battleship/ships.js','utf8'),context);
  vm.runInContext(fs.readFileSync('battleship/live.js','utf8'),context);
  await new Promise(setImmediate);
  return {nodes,requests,lanes,context,refresh:()=>vm.runInContext('refresh()',context),runTimers:()=>{let count=0;while(timers.size){assert.ok(count++<100,'Unexpected timer loop');const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}}};
}

for(const mode of ['live-1','live-2','rng']){
  test(`${mode}: select, place all five ships, launch and show lobby rules`,async()=>{
    const {nodes,requests}=await page();
    assert.equal(nodes.get('place').disabled,false);
    await nodes.get('mode-'+mode).onclick();
    assert.equal(requests.at(-1).gameMode,mode);
    assert.equal(nodes.get('game-rules').textContent,{'live-1':'Live Keno draws - 1 ship sinks, you lose.','live-2':'Live Keno draws - 2 ships sink, you lose.',rng:'Simulated draws every 30 seconds - All 5 ships sink, you lose.'}[mode]);
    if(mode==='rng')assert.equal(nodes.get('next-draw').textContent,'');
    nodes.get('place').onclick();
    assert.equal(nodes.get('change-mode').disabled,false);
    assert.equal(nodes.get('launch').hidden,true);
    for(let i=0;i<5;i++){
      const ship=[...nodes.values()].find(e=>e.id.startsWith('cell-')&&e.className.split(' ').includes('ship-lifted'));
      assert.ok(ship,'A ship should be ready to lock');ship.onclick({detail:0});
    }
    assert.equal(nodes.get('launch').hidden,false);
    nodes.get('player-name').value='Captain';await nodes.get('launch').onclick();
    assert.equal(requests.at(-1).action,'join');assert.equal(requests.at(-1).gameMode,mode);
    assert.equal(requests.at(-1).fleet.length,5);
    assert.equal(new Set(requests.at(-1).fleet.flatMap(s=>s.cells)).size,17);
    assert.equal(nodes.get('entry-status').textContent,'');
    assert.equal(nodes.get('rng-lobby').hidden,false);
    assert.equal(nodes.get('lobby-countdown').textContent,'Waiting for a second Captain.');
    assert.equal(nodes.get('extend-countdown').hidden,true);
    assert.equal(nodes.get('setup-controls').hidden,true);
    assert.equal(nodes.get('change-mode').disabled,false);
  });
}

test('invalid saved mode falls back to live-2',async()=>{
  const {requests}=await page('?gameMode=invalid');assert.equal(requests[0].gameMode,'live-2');
});

test('outdated backend cannot silently present live Keno as RNG',async()=>{
  const {nodes,requests}=await page('?gameMode=rng',{legacy:true});
  assert.equal(nodes.get('place').disabled,true);
  assert.match(nodes.get('connection').textContent,/awaiting a server update/);
  assert.equal(nodes.get('next-draw').textContent,'');
  assert.equal(requests.length,1);assert.equal(requests[0].action,'status');
});

test('joined captain sees a shared lobby countdown and can add 60 seconds',async()=>{
  const {nodes,requests,lanes,refresh}=await page('?gameMode=rng');
  const ends=new Date(Date.now()+60000).toISOString();
  lanes.set('rng',{active:null,recent:[],last:null,lobby:{id:'rng-lobby-1',gameMode:'rng',status:'lobby',countdownEndsAt:ends,players:[{id:'me',name:'Me',fleet:[],hits:[]},{id:'other',name:'Other',fleet:[],hits:[]}]}});
  await refresh();assert.equal(nodes.get('rng-lobby').hidden,false);
  assert.match(nodes.get('lobby-countdown').textContent,/Battle begins in/);
  assert.equal(nodes.get('extend-countdown').hidden,false);
  await nodes.get('extend-countdown').onclick();
  assert.equal(requests.at(-1).action,'extend');assert.equal(requests.at(-1).matchId,'rng-lobby-1');
  assert.equal(Date.parse(lanes.get('rng').lobby.countdownEndsAt),Date.parse(ends)+60000);
});

test('spectators can watch the countdown but cannot extend it',async()=>{
  const {nodes,lanes,refresh}=await page('?gameMode=rng');
  lanes.set('rng',{active:null,recent:[],last:null,lobby:{id:'rng-lobby-1',gameMode:'rng',status:'lobby',countdownEndsAt:new Date(Date.now()+60000).toISOString(),players:[{id:'one',name:'One',fleet:[],hits:[]},{id:'two',name:'Two',fleet:[],hits:[]}]}});
  await refresh();assert.equal(nodes.get('rng-lobby').hidden,false);assert.equal(nodes.get('extend-countdown').hidden,true);
});

test('Recent Results use each match type, Mountain date, live range or draw count, and winner',async()=>{
  const {nodes,lanes,refresh}=await page('?gameMode=rng');
  const summary={status:'finished',startGame:250,finish:{racenumber:252,timestamp:'2026-11-19T01:30:00Z'},players:[{id:'winner',name:'Captain Winner'}],winners:['winner']};
  lanes.set('rng',{active:null,lobby:null,last:null,recent:[{...summary,id:'legacy'},{...summary,id:'one',gameMode:'live-1'},{...summary,id:'rng',gameMode:'rng',drawCount:9}]});
  await refresh();
  const table=nodes.get('recent-results').children[1].children[0];
  const rows=table.children[1].children;
  assert.deepEqual(rows.map(row=>row.children[0].textContent),['Live Keno-2 Ship','Live Keno-1 Ship','Simulated Draw']);
  assert.ok(rows.every(row=>row.children[1].textContent==='Nov 18'));
  assert.equal(rows[0].children[2].children[0].textContent,'#250 → #252');
  assert.equal(rows[2].children[2].children[0].textContent,'9 simulated draws');
  assert.match(rows[0].children[2].children[0].href,/gameMode=live-2/);
  assert.match(rows[1].children[2].children[0].href,/gameMode=live-1/);
  assert.match(rows[2].children[2].children[0].href,/gameMode=rng/);
  assert.ok(rows.every(row=>row.children[3].textContent==='Captain Winner'));
});

test('mode picker opens on arrival, closes on selection, and can be reopened to switch back',async()=>{
  const {nodes,requests}=await page();
  assert.equal(nodes.get('mode-popup').open,true);
  await nodes.get('mode-rng').onclick();
  assert.equal(nodes.get('mode-popup').open,false);
  assert.equal(nodes.get('current-mode').textContent,'Simulated Draw');
  nodes.get('change-mode').onclick();assert.equal(nodes.get('mode-popup').open,true);
  await nodes.get('mode-live-1').onclick();
  assert.equal(nodes.get('current-mode').textContent,'Live Keno - 1 Ship');
  assert.equal(requests.at(-1).gameMode,'live-1');
  nodes.get('change-mode').onclick();await nodes.get('mode-rng').onclick();
  assert.equal(requests.at(-1).gameMode,'rng');
  nodes.get('change-mode').onclick();nodes.get('mode-close').onclick();
  assert.equal(nodes.get('mode-popup').open,false);
  assert.equal(nodes.get('current-mode').textContent,'Simulated Draw');
});

test('switching modes during placement preserves the unlaunched fleet',async()=>{
  const {nodes,requests}=await page();
  await nodes.get('mode-live-2').onclick();nodes.get('place').onclick();
  const ship=[...nodes.values()].find(e=>e.id.startsWith('cell-')&&e.className.split(' ').includes('ship-lifted'));
  ship.onclick({detail:0});
  const before=[...nodes.values()].filter(e=>e.id.startsWith('cell-')&&e.className.split(' ').includes('ship')).map(e=>e.id);
  nodes.get('change-mode').onclick();await nodes.get('mode-rng').onclick();
  assert.equal(requests.at(-1).gameMode,'rng');assert.equal(nodes.get('place').hidden,false);
  assert.match(nodes.get('message').textContent,/ship placement is saved/);
  nodes.get('place').onclick();
  const after=[...nodes.values()].filter(e=>e.id.startsWith('cell-')&&e.className.split(' ').includes('ship')).map(e=>e.id);
  assert.deepEqual(after,before);
  assert.ok(!requests.some(r=>r.action==='join'));
});

test('mode choices stay enabled during polling and an old response cannot replace the new mode',async()=>{
  let hold=false,release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const {nodes,requests,lanes,refresh}=await page('',{beforeResponse:async body=>{
    if(hold&&body.action==='status'&&body.gameMode==='live-2'){hold=false;await delayed;}
  }});
  lanes.set('live-2',{active:null,recent:[],last:null,lobby:{id:'old-lobby',status:'lobby',gameMode:'live-2',players:[{id:'old',name:'Old mode captain',fleet:[],hits:[]}]}});
  hold=true;const oldRefresh=refresh();await new Promise(setImmediate);
  for(const mode of ['live-1','live-2','rng'])assert.equal(nodes.get('mode-'+mode).disabled,false);
  await nodes.get('mode-rng').onclick();
  assert.equal(nodes.get('mode-popup').open,false);
  assert.equal(nodes.get('current-mode').textContent,'Simulated Draw');
  assert.equal(requests.at(-1).gameMode,'rng');
  release();await oldRefresh;
  assert.equal(nodes.get('current-mode').textContent,'Simulated Draw');
  assert.equal(nodes.get('phase').textContent,'Ready to deploy');
  assert.match(nodes.get('connection').textContent,/Connected to shared simulated draws/);
  assert.equal(nodes.get('place').disabled,false);
});

for(const gameMode of ['live-1','live-2']){
  test(`${gameMode}: waiting banner clears when the second captain joins`,async()=>{
    const {nodes,lanes,refresh}=await page('?gameMode='+gameMode);
    const players=[{id:'me',name:'Me',fleet:[],hits:[]}];
    const lobby={id:'live-lobby',gameMode,status:'lobby',expectedGame:123,players};
    lanes.set(gameMode,{active:null,recent:[],last:null,lobby});
    await refresh();assert.equal(nodes.get('rng-lobby').hidden,false);
    assert.equal(nodes.get('lobby-countdown').textContent,'Waiting for a second Captain.');
    players.push({id:'other',name:'Other',fleet:[],hits:[]});
    await refresh();assert.equal(nodes.get('rng-lobby').hidden,true);
    assert.match(nodes.get('entry-status').textContent,/Battle will begin with Game #123/);
  });
}

async function launchFleet(view,name){
  await view.nodes.get('mode-rng').onclick();view.nodes.get('place').onclick();
  for(let i=0;i<5;i++){
    const ship=[...view.nodes.values()].find(e=>e.id.startsWith('cell-')&&e.className.split(' ').includes('ship-lifted'));
    ship.onclick({detail:0});
  }
  view.nodes.get('player-name').value=name;await view.nodes.get('launch').onclick();
}

test('both independently signed-in captains can extend the shared countdown immediately after launching',async()=>{
  const lanes=new Map();
  const first=await page('?gameMode=rng',{uid:'captain-a',sharedLanes:lanes});
  const second=await page('?gameMode=rng',{uid:'captain-b',sharedLanes:lanes});
  await launchFleet(first,'First');await launchFleet(second,'Second');await first.refresh();
  for(const view of [first,second]){
    assert.equal(view.nodes.get('result-popup').open===true,false,'Launch overlay must not cover the countdown');
    assert.equal(view.nodes.get('rng-lobby').hidden,false);
    assert.equal(view.nodes.get('extend-countdown').hidden,false);
    assert.equal(view.nodes.get('extend-countdown').disabled,false);
  }
  const deadline=Date.parse(lanes.get('rng').lobby.countdownEndsAt);
  await first.nodes.get('extend-countdown').onclick();await second.refresh();
  await second.nodes.get('extend-countdown').onclick();await first.refresh();
  assert.equal(Date.parse(lanes.get('rng').lobby.countdownEndsAt),deadline+120000);
  assert.equal(first.nodes.get('lobby-countdown').textContent,second.nodes.get('lobby-countdown').textContent);
});

test('countdown extension stays clickable during polling and a delayed response cannot undo it',async()=>{
  let hold=false,release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const view=await page('?gameMode=rng',{beforeResponse:async body=>{
    if(hold&&body.action==='status'){hold=false;await delayed;}
  }});
  const {nodes,lanes,refresh}=view;
  const deadline=Date.now()+60000;
  lanes.set('rng',{active:null,recent:[],last:null,lobby:{id:'rng-lobby',status:'lobby',gameMode:'rng',countdownEndsAt:new Date(deadline).toISOString(),players:[{id:'me',name:'Me',fleet:[],hits:[]},{id:'other',name:'Other',fleet:[],hits:[]}]}});
  await refresh();hold=true;const oldRefresh=refresh();await new Promise(setImmediate);
  assert.equal(nodes.get('extend-countdown').disabled,false);
  await nodes.get('extend-countdown').onclick();
  release();await oldRefresh;
  assert.equal(Date.parse(lanes.get('rng').lobby.countdownEndsAt),deadline+60000);
  assert.match(nodes.get('lobby-countdown').textContent,/Battle begins in [12]:/);
  assert.equal(nodes.get('extend-countdown').disabled,false);
});

test('final RNG animation survives background polling and shows the winner before the next lobby',async()=>{
  const archivedMatches=new Map(),view=await page('?gameMode=rng',{archivedMatches});
  const {nodes,lanes,refresh}=view;
  await nodes.get('mode-rng').onclick();
  const players=[{id:'me',name:'Me',fleet:[],hits:[],eliminated:null},{id:'other',name:'Other',fleet:[],hits:[],eliminated:null}];
  const first={raceid:1,racenumber:1,timestamp:new Date().toISOString(),balls:[60]};
  const active={id:'final-match',gameMode:'rng',status:'active',startGame:1,history:[first],players,winners:[]};
  lanes.set('rng',{active,lobby:null,recent:[],last:null});await refresh();
  const finish={raceid:2,racenumber:2,timestamp:new Date().toISOString(),ball:1,number:80};
  const completed={...active,status:'finished',history:[first,{...finish,balls:[80]}],winners:['other'],finish};
  archivedMatches.set(active.id,completed);
  lanes.set('rng',{active:null,lobby:null,recent:[completed],last:null});await refresh();
  // The next poll arrives while the last ball animation is still queued.
  lanes.get('rng').lobby={id:'next-lobby',gameMode:'rng',status:'lobby',players:[]};
  await refresh();view.runTimers();
  assert.equal(nodes.get('result-popup').open,true);
  assert.equal(nodes.get('result-title').textContent,'Other wins!');
  assert.equal(nodes.get('result-banner').hidden,false);
  nodes.get('result-popup').close();await refresh();
  assert.equal(nodes.get('phase').textContent,'Match finished');
  assert.equal(nodes.get('result-popup').open,false,'Outcome should appear once');
});

// Returning captains skip the mode picker.
const lobbyWith=(mode,ids)=>({active:null,recent:[],last:{raceid:1,racenumber:1},lobby:{id:'lobby-'+mode,gameMode:mode,status:'lobby',
  players:ids.map(id=>({id,name:id,fleet:[],hits:[],eliminated:null,joinedAt:new Date().toISOString()}))}});
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);};

test('a captain with a fleet in a lobby goes straight back to that mode, no picker',async()=>{
  const lanes=new Map([['rng',lobbyWith('rng',['me','other'])]]);
  const {nodes,requests}=await page('',{reportFleets:true,sharedLanes:lanes,savedMode:'live-2'});await settle();
  assert.ok(!nodes.get('mode-popup').open,'picker stays closed');
  assert.equal(nodes.get('current-mode').textContent,'Simulated Draw');
  assert.equal(requests.at(-1).gameMode,'rng');
});

test('a running battle is preferred over a lobby, and the viewed mode wins when it has a fleet',async()=>{
  const battle={active:{id:'m1',gameMode:'live-1',status:'active',players:[{id:'me',name:'me',fleet:[],hits:[],eliminated:null}],history:[]},lobby:null,recent:[],last:{raceid:1,racenumber:1}};
  let view=await page('',{reportFleets:true,sharedLanes:new Map([['rng',lobbyWith('rng',['me'])],['live-1',battle]]),savedMode:'live-2'});await settle();
  assert.ok(!view.nodes.get('mode-popup').open,'picker stays closed');
  assert.equal(view.nodes.get('current-mode').textContent,'Live Keno - 1 Ship');
  view=await page('',{reportFleets:true,sharedLanes:new Map([['rng',lobbyWith('rng',['me'])],['live-1',battle]]),savedMode:'rng'});await settle();
  assert.equal(view.nodes.get('current-mode').textContent,'Simulated Draw');
});

test('a captain sunk in a running battle has no deployed fleet, so the picker opens',async()=>{
  const sunk={active:{id:'m1',gameMode:'live-2',status:'active',players:[{id:'me',name:'me',fleet:[],hits:[],eliminated:{raceid:2}}],history:[]},lobby:null,recent:[],last:{raceid:1,racenumber:1}};
  const {nodes}=await page('',{reportFleets:true,sharedLanes:new Map([['live-2',sunk]])});await settle();
  assert.equal(nodes.get('mode-popup').open,true);
});

test('no deployed fleet opens the picker',async()=>{
  const {nodes}=await page('',{reportFleets:true});await settle();
  assert.equal(nodes.get('mode-popup').open,true);
});

test('a mode link (homepage strip) goes straight to that mode, even with a fleet elsewhere',async()=>{
  const lanes=new Map([['rng',lobbyWith('rng',['me'])],['live-1',lobbyWith('live-1',['someone'])]]);
  const {nodes,requests}=await page('?gameMode=live-1',{reportFleets:true,sharedLanes:lanes});await settle();
  assert.ok(!nodes.get('mode-popup').open,'picker stays closed');
  assert.equal(nodes.get('current-mode').textContent,'Live Keno - 1 Ship');
  assert.ok(requests.every(r=>r.gameMode==='live-1'));
});

test('before the server reports fleets, the picker still opens unless a mode link was followed',async()=>{
  let view=await page('',{reportFleets:false});await settle();
  assert.equal(view.nodes.get('mode-popup').open,true);
  view=await page('?gameMode=rng',{reportFleets:false});await settle();
  assert.ok(!view.nodes.get('mode-popup').open,'picker stays closed');
  assert.equal(view.nodes.get('current-mode').textContent,'Simulated Draw');
});
