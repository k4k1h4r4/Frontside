const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function page(search='',{legacy=false,beforeResponse=null}={}){
  const nodes=new Map(),requests=[],saved=new Map(),lanes=new Map();
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
    setAttribute(){} addEventListener(){} querySelectorAll(){return [];} focus(){}
    showModal(){this.open=true;} close(){this.open=false;}
  }
  const html=fs.readFileSync('battleship.html','utf8');
  for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set(id,new Element(id));
  const board=new Element();
  const document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id)||null,querySelector:s=>s==='.keno-board-wrap'?board:null,createElement:()=>new Element(),addEventListener(){}};
  const session={access_token:'test',user:{id:'me'}};
  const client={auth:{getSession:async()=>({data:{session}})}};
  const context=vm.createContext({document,location:{search},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},window:{supabase:{createClient:()=>client},addEventListener(){}},ResizeObserver:class{observe(){}},URLSearchParams,AbortController,AbortSignal,structuredClone,Date,crypto:require('node:crypto').webcrypto,console,setTimeout:()=>1,clearTimeout(){},setInterval(){},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    if(beforeResponse)await beforeResponse(body);
    let state=lanes.get(body.gameMode)||{active:null,lobby:null,recent:[],last:null};
    if(body.action==='join'){
      state={...state,lobby:{id:'match-'+body.gameMode,gameMode:body.gameMode,status:'lobby',players:[{id:'me',name:body.name,fleet:body.fleet,hits:[],eliminated:null}]}};
      lanes.set(body.gameMode,state);
    }
    if(body.action==='extend')state.lobby.countdownEndsAt=new Date(Date.parse(state.lobby.countdownEndsAt)+60000).toISOString();
    return {ok:true,json:async()=>({...(!legacy?{gameMode:body.gameMode,rulesVersion:2}:{}),uid:'me',state:structuredClone(state),caughtUp:true,warning:'',serverTime:new Date().toISOString()})};
  }});
  vm.runInContext(fs.readFileSync('battleship/ships.js','utf8'),context);
  vm.runInContext(fs.readFileSync('battleship/live.js','utf8'),context);
  await new Promise(setImmediate);
  return {nodes,requests,lanes,context,refresh:()=>vm.runInContext('refresh()',context)};
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
