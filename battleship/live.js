import { shipArt } from './ships.js';
const SUPABASE_URL='https://znqnnaslskjewfxcswxw.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_0pVZp5JcAc9lSIClZD5eqQ_9Q33F7Uf';
const MOUNTAIN_TIME_ZONE='America/Denver';
const SPECS=[['Carrier',5],['Battleship',4],['Destroyer',3],['Submarine',3],['Patrol Boat',2]];
const $=id=>document.getElementById(id),board=document.querySelector('.keno-board-wrap');
const resultsPage=document.querySelector('[data-results]')!==null;
const storage={get(k){try{return localStorage.getItem('battleship:'+k);}catch{return null;}},set(k,v){try{localStorage.setItem('battleship:'+k,v);}catch{}}};
let client,uid='',snapshot=null,match=null,viewed='',mode='auto',placing=false,busy=false,polling=false;
let selected=0,vertical=false,gesture=null,draft=emptyFleet(),animation=null,pendingImpact=null,visual=null,initial=true;
function emptyFleet(){return SPECS.map(([name,length])=>({name,length,cells:[],locked:false}));}
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function message(text){$('message').textContent=text;}
function time(value){return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:MOUNTAIN_TIME_ZONE});}
function hits(p){return new Set(p?.hits||[]);}
function sunk(s,p){return s.cells.length>0&&s.cells.every(n=>hits(p).has(n));}
function remaining(p){return (p?.fleet||[]).filter(s=>!sunk(s,p)).length;}
function allLocked(){return draft.every(s=>s.locked&&s.cells.length===s.length);}
async function api(action,extra={}){
  const {data:{session}}=await client.auth.getSession();
  if(!session)throw Error('Session unavailable. Reload to reconnect.');
  const response=await fetch(`${SUPABASE_URL}/functions/v1/battleship`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(60000)});
  let data;try{data=await response.json();}catch{throw Error('Battleship backend is not available yet. Deploy the server function and SQL first.');}
  if(!response.ok)throw Error(data.error||'Could not load Battleship.');return data;
}
function owned(m){return m?.players.find(p=>p.id===uid);}
function inspected(m){return m?.players.find(p=>p.id===viewed)||owned(m)||m?.players[0];}
function chooseMatch(){
  if(mode==='active'&&snapshot.active)return snapshot.active;
  if(mode==='lobby'&&snapshot.lobby)return snapshot.lobby;
  if(owned(snapshot.lobby))return snapshot.lobby;
  if(owned(snapshot.active))return snapshot.active;
  return snapshot.active||snapshot.lobby;
}
async function refresh(){
  if(polling||busy||document.hidden)return;polling=true;
  try{
    const data=await api('status');uid=data.uid;snapshot=data.state;
    $('connection').textContent=data.warning||(!data.caughtUp?'Catching up missed Keno draws…':snapshot.last?`Latest received: Game #${snapshot.last.racenumber} · ${time(snapshot.last.timestamp)} MT`:'Waiting for Keno results.');
    $('place').disabled=!data.caughtUp||!!data.warning;
    const canSwitch=!!snapshot.active&&!!snapshot.lobby;
    $('active-view').hidden=!canSwitch;$('lobby-view').hidden=!canSwitch;
    if(resultsPage){await loadResults();initial=false;return;}
    const previous=storage.get('match');
    if(initial&&previous&&!storage.get(`seen:${previous}`)&&!owned(snapshot.active)&&!owned(snapshot.lobby)){
      try{const saved=await api('result',{matchId:previous});if(saved.match){location.replace(`battleship-results.html?match=${encodeURIComponent(previous)}`);return;}}catch{/* A queued entry may not have a result yet. */}
    }
    if(pendingImpact){renderRecent();initial=false;return;}
    const latest=chooseMatch();
    // A just-finished match can disappear from active state between polls.
    const ended=match?.status==='active'&&snapshot.recent.find(m=>m.id===match.id);
    if(ended&&!placing){const result=await api('result',{matchId:ended.id});updateMatch(result.match);}
    else if(!placing)updateMatch(latest);
    renderRecent();if(placing)render();initial=false;
  }catch(e){$('connection').textContent=e.message;$('place').disabled=true;}
  finally{polling=false;}
}
function updateMatch(next){
  const old=match;match=next;
  if(owned(match))storage.set('match',match.id);
  if(!match||old?.id!==match.id||document.hidden){stopAnimation();visual=match;render();notifyOutcome();return;}
  const oldCount=(old.history||[]).reduce((n,d)=>n+d.balls.length,0),newCount=(next.history||[]).reduce((n,d)=>n+d.balls.length,0);
  if(newCount>oldCount&&newCount-oldCount<=20&&!animation){
    const from=structuredClone(old);
    if(!old.history){from.status=next.status;from.startGame=next.startGame;from.history=[];from.winners=[];delete from.finish;from.players=structuredClone(next.players).map(p=>({...p,hits:[],eliminated:null}));}
    pendingImpact={from,next};visual=pendingImpact.from;render();
    const incoming=next.history.flatMap(d=>d.balls.map(number=>({number,draw:d}))).slice(oldCount)[0]?.draw;
    showPopup('Incoming, Incoming!',incoming?`Keno Draw #${incoming.racenumber} is ready.`:'A new Keno draw is ready.',{className:'result-impact',button:'Brace for Impact!',after:playPendingImpact});
  }else if(!animation){visual=match;render();notifyOutcome();}
}
function playPendingImpact(){
  const pending=pendingImpact;if(!pending)return;pendingImpact=null;match=pending.next;
  const oldCount=(pending.from.history||[]).reduce((n,d)=>n+d.balls.length,0);
  const events=pending.next.history.flatMap(d=>d.balls.map((number,i)=>({number,draw:d,index:i+1}))).slice(oldCount);
  visual=structuredClone(pending.from);let position=0;
  function step(){
    const {number,draw,index}=events[position++];
    let record=visual.history.find(d=>d.raceid===draw.raceid);
    if(!record){record={...draw,balls:[]};visual.history.push(record);}record.balls.push(number);
    for(const p of visual.players){if(p.eliminated)continue;if(p.fleet.some(s=>s.cells.includes(number))&&!p.hits.includes(number))p.hits.push(number);if(5-remaining(p)>=2)p.eliminated={raceid:draw.raceid,ball:index,number};}
    render();const cell=$('cell-'+number);void cell.offsetWidth;cell.classList.add('ball-impact');
    if(position<events.length)animation=setTimeout(step,500);
    else{animation=null;visual=match;render();notifyOutcome();}
  }
  if(events.length)animation=setTimeout(step,0);else{visual=match;render();notifyOutcome();}
}
function stopAnimation(){clearTimeout(animation);animation=null;visual=match;}
function showPopup(title,detail,{className='',button='Continue',after=null}={}){
  const dialog=$('result-popup'),dismiss=$('result-dismiss');
  $('result-title').textContent=title;$('result-detail').textContent=detail;dialog.className=className;dismiss.textContent=button;
  dismiss.onclick=after?()=>{dismiss.onclick=null;setTimeout(after,0);}:null;
  if(dialog.open)dialog.close();dialog.showModal();
}
function notifyOutcome(){
  if(!match)return;const me=owned(match),finished=match.status==='finished';
  if(!finished&&!me?.eliminated)return;
  const key=`notice:${match.id}:${finished?'finished':'out'}`;if(storage.get(key))return;storage.set(key,'1');
  const winners=match.players.filter(p=>match.winners?.includes(p.id));const won=winners.some(p=>p.id===uid);
  const title=finished?(won?(winners.length>1?'You share the win!':'You win!'):`${winners.map(p=>p.name).join(' & ')} wins!`):'Two ships sunk. You lose.';
  const detail=finished?`Game #${match.finish.racenumber}, ball ${match.finish.ball}: ${match.finish.number}.`:'Your second ship has sunk. You can watch the match or join the upcoming lobby.';
  showPopup(title,detail,{className:won?'result-win':'result-loss'});
}
function render(){
  const shown=visual||match,me=owned(shown);
  const inspection=placing?{id:uid,name:'You',fleet:draft,hits:[]}:inspected(shown);
  const boardFleet=placing?draft:inspection?.fleet||[],boardHits=placing?new Set():hits(inspection),allShots=new Set((shown?.history||[]).flatMap(d=>d.balls));
  for(let n=1;n<=80;n++){
    const cell=$('cell-'+n),s=boardFleet.find(s=>s.cells.includes(n));
    cell.className='keno-cell'+(s?' ship':'')+(s&&boardHits.has(n)?' hit':!s&&allShots.has(n)?' miss':'')+(s&&!placing&&sunk(s,inspection)?' sunk':'')+(s&&placing&&!s.locked?' ship-lifted':'');
    cell.disabled=!placing||busy;cell.setAttribute('aria-label',`${n}${s?', '+s.name:''}${s&&boardHits.has(n)?', hit':''}`);
  }
  board.classList.toggle('is-placing',placing);renderShips(boardFleet,inspection);
  $('water-owner').textContent=inspection&&inspection.id!==uid?`${inspection.name.toUpperCase()}'S WATERS`:'YOUR WATERS';
  $('fleet-owner').textContent=inspection?.id===uid?'Your fleet':inspection?`${inspection.name}'s fleet`:'Your fleet';
  $('afloat').textContent=placing?`${draft.filter(s=>s.locked).length} / 5 locked`:inspection?.fleet.length?`${remaining(inspection)} / 5 afloat`:shown?.status==='lobby'?'Fleet locked until start':'';
  $('fleet').replaceChildren(...(inspection?.fleet||[]).map((s,i)=>{
    const button=element('button','fleet-item'+(placing&&selected===i?' selected':''));button.disabled=!placing||busy;
    const line=element('span','fleet-line');line.append(element('strong','',s.name),element('small','',placing?(s.locked?'LOCKED':'TAP TO LOCK'):sunk(s,inspection)?'SUNK':`${s.cells.filter(n=>hits(inspection).has(n)).length} / ${s.length} HITS`));
    const shape=element('span','fleet-ship'+(sunk(s,inspection)?' wreck':''));shape.style.setProperty('--spaces',s.length);shape.setAttribute('aria-hidden','true');shape.innerHTML=shipArt(s.name);
    const markers=element('span','fleet-ship-spaces');s.cells.forEach(n=>markers.append(element('span',hits(inspection).has(n)?'fleet-fire':'')));shape.append(markers);button.append(line,shape);button.onclick=()=>selectShip(i);return button;
  }));
  const focused=document.activeElement?.id;
  $('scores').replaceChildren(...(shown?.players||[]).map(p=>{const b=element('button','score-player');b.id='player-'+p.id;b.setAttribute('aria-pressed',String(inspection?.id===p.id));const name=element('span','',p.id===uid?`${p.name} (you)`:p.name);if(p.eliminated)name.append(element('small','player-out','OUT · 2 ships sunk'));b.append(name,element('strong','',shown.status==='lobby'?'—':remaining(p)));b.onclick=()=>{viewed=p.id;render();};return b;}));
  if(focused?.startsWith('player-'))document.getElementById(focused)?.focus({preventScroll:true});
  const inActive=owned(snapshot?.active)&&!owned(snapshot.active).eliminated,inLobby=!!owned(snapshot?.lobby);
  $('active-view').setAttribute('aria-pressed',String(shown?.id===snapshot?.active?.id));
  $('lobby-view').setAttribute('aria-pressed',String(shown?.id===snapshot?.lobby?.id));
  $('setup-controls').hidden=resultsPage||(placing?!allLocked():(inActive||inLobby));
  $('place').hidden=placing;$('rotate').hidden=!placing;$('rotate').disabled=busy||!!draft[selected]?.locked;$('rotate').textContent='Rotate Ship';
  $('launch').hidden=!placing||!allLocked();$('launch').disabled=busy;$('launch').textContent=busy?'Launching…':'Launch fleet';$('name-wrap').hidden=!placing;
  $('phase').textContent=placing?'Deploy your fleet':shown?.status==='active'?(me?.eliminated?'Eliminated · Spectating':'Battle in progress'):shown?.status==='finished'?'Match finished':shown?.status==='lobby'?'Waiting for start':'Ready to deploy';
  $('round').hidden=placing||!shown?.history?.length;$('round').textContent=shown?.history?.length?`GAME #${shown.history.at(-1).racenumber}`:'';
  const lobby=snapshot?.lobby;
  $('entry-status').textContent=shown?.status==='active'?'':lobby?lobby.startRaceId?`Lobby starts with the next result after Game #${snapshot.last.racenumber}. ${lobby.players.length} player(s) locked. At least two required.`:`Upcoming lobby: ${lobby.players.length} player(s). Starts after the active match.`:'Launch your fleet to join the next lobby.';
  $('result-banner').hidden=shown?.status!=='finished';
  if(shown?.status==='finished'){const names=shown.players.filter(p=>shown.winners.includes(p.id)).map(p=>p.name).join(' & ');$('result-banner').replaceChildren(element('h2','',`${names} ${shown.winners.length>1?'share the win':'wins'}!`),element('p','',`Decided in Game #${shown.finish.racenumber}, ball ${shown.finish.ball} (${shown.finish.number}).`));const a=element('a','','Open game results');a.href=`battleship-results.html?match=${encodeURIComponent(shown.id)}`;$('result-banner').append(a);}
  renderHistory(shown);
}
function renderShips(fleet,player){
  board.querySelectorAll('.ship-silhouette').forEach(e=>e.remove());
  for(const s of fleet.filter(s=>s.cells.length)){
    const first=$('cell-'+s.cells[0]),last=$('cell-'+s.cells.at(-1));if(!first||!last)continue;
    const w=last.offsetLeft-first.offsetLeft+last.offsetWidth,h=last.offsetTop-first.offsetTop+last.offsetHeight;
    const shape=element('div','ship-silhouette'+(!placing&&sunk(s,player)?' wreck':''));shape.setAttribute('aria-hidden','true');shape.style.cssText=`left:${first.offsetLeft}px;top:${first.offsetTop}px;width:${w}px;height:${h}px`;shape.innerHTML=shipArt(s.name);
    if(s.cells[1]-s.cells[0]===10)shape.firstElementChild.style.cssText=`width:${h}px;height:${w}px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(90deg)`;board.append(shape);
  }
}
function renderHistory(m){
  const history=m?.history||[],last=history.at(-1);$('draw-summary').textContent=history.length?`${history.length} draws since Game #${m.startGame}`:'Waiting for the starting draw';
  $('balls').replaceChildren(...(last?.balls||[]).map((n,i)=>{const b=element('span','draw-ball',n);b.title=`Ball ${i+1}`;return b;}));
  $('history').replaceChildren(...[...history].reverse().map(d=>{const row=element('div','draw-history-row');row.append(element('strong','',`Game #${d.racenumber}`),element('span','',`${time(d.timestamp)} MT`),element('small','',`${d.balls.length} balls applied`));return row;}));
}
function renderRecent(){
  $('recent-results').replaceChildren(element('h2','','Recent results'));
  for(const m of snapshot.recent){const a=element('a','',`Game #${m.startGame} → #${m.finish.racenumber}: ${m.players.filter(p=>m.winners.includes(p.id)).map(p=>p.name).join(' & ')}`);a.href=`battleship-results.html?match=${encodeURIComponent(m.id)}`;const p=element('p');p.append(a);$('recent-results').append(p);}
}
async function loadResults(){
  $('active-view').hidden=true;$('lobby-view').hidden=true;
  const id=new URLSearchParams(location.search).get('match');
  if(id&&match?.id!==id){const data=await api('result',{matchId:id});match=data.match;visual=match;storage.set(`seen:${id}`,'1');}
  render();renderRecent();$('setup-controls').hidden=true;
  if(!id){$('phase').textContent='Choose a completed match';}
}
function candidate(start,upright=vertical){
  const len=draft[selected].length,row=Math.floor((start-1)/10),col=(start-1)%10;
  if(!Number.isInteger(start)||start<1||start>80||(upright?row+len>8:col+len>10))return [];
  const cells=Array.from({length:len},(_,i)=>start+i*(upright?10:1));
  return cells.some(n=>draft.some((s,i)=>i!==selected&&s.cells.includes(n)))?[]:cells;
}
function saveDraft(){storage.set('draft',JSON.stringify(draft));}
function stageShip(i){selected=i;if(draft[i].cells.length){vertical=draft[i].cells[1]-draft[i].cells[0]===10;return;}for(const v of [false,true])for(let n=1;n<=80;n++){const cells=candidate(n,v);if(cells.length){vertical=v;draft[i].cells=cells;draft[i].locked=false;saveDraft();return;}}message('No open space. Move another ship to make room.');}
function selectShip(i){if(!placing||busy)return;selected=i;draft[i].locked=false;stageShip(i);saveDraft();render();message(`${draft[i].name}: drag to move; tap to lock.`);}
function moveShip(n){const cells=candidate(n);if(!cells.length)return false;draft[selected].cells=cells;draft[selected].locked=false;saveDraft();render();return true;}
function tapCell(n){
  if(!placing||busy)return;const i=draft.findIndex(s=>s.cells.includes(n));
  if(i<0){moveShip(n);return;}
  if(i===selected&&!draft[i].locked){draft[i].locked=true;const next=draft.findIndex(s=>!s.locked);if(next>=0)stageShip(next);saveDraft();render();message(next<0?'All ships locked. Enter your name and launch.':`${draft[i].name} locked. Move your ${draft[next].name}, then tap to lock.`);}
  else selectShip(i);
}
for(let n=1;n<=80;n++){const b=element('button','keno-cell');b.id='cell-'+n;b.dataset.number=n;b.append(element('span','cell-number',n));b.onclick=e=>{if(e.detail===0)tapCell(n);};$(n<=40?'section-low':'section-high').append(b);}
board.addEventListener('pointerdown',e=>{
  if(!placing||busy||e.button!==0)return;const cell=e.target.closest('.keno-cell');if(!cell)return;
  const n=Number(cell.dataset.number),i=draft.findIndex(s=>s.cells.includes(n));
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,n,index:i,dragged:false,offset:i>=0?draft[i].cells.indexOf(n):0};board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;if(!gesture.dragged&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<7)return;
  if(!gesture.dragged){gesture.dragged=true;if(gesture.index>=0)selectShip(gesture.index);}
  const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.keno-cell');if(cell)moveShip(Number(cell.dataset.number)-gesture.offset*(vertical?10:1));
});
board.addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);if(!g.dragged)tapCell(g.n);else message(`Tap ${draft[selected].name} to lock it.`);});
board.addEventListener('pointercancel',()=>{gesture=null;});
$('place').onclick=()=>{if(busy||!snapshot)return;stopAnimation();placing=true;viewed=uid;selected=draft.findIndex(s=>!s.locked);if(selected<0)selected=0;stageShip(selected);render();message('Drag the highlighted ship, then tap it to lock. Tap a locked ship to lift it.');};
$('rotate').onclick=()=>{if(!placing||busy||draft[selected].locked)return;vertical=!vertical;const start=draft[selected].cells[0];if(start&&!moveShip(start)){vertical=!vertical;message('No room to rotate here. Move the ship first.');}render();};
$('launch').onclick=async()=>{
  if(busy||!placing||!allLocked())return;
  const name=$('player-name').value.trim();if(name.length<2||name.length>30){message('Enter a name between 2 and 30 characters.');$('player-name').focus();return;}
  busy=true;render();message('Checking the latest draw and locking your fleet…');
  try{
    const data=await api('join',{name,fleet:draft});snapshot=data.state;uid=data.uid;storage.set('name',name);placing=false;mode='auto';match=chooseMatch();visual=match;if(owned(match))storage.set('match',match.id);storage.set('draft','');draft=emptyFleet();message('Fleet saved. You can leave this page and return to the match.');
    const lobby=snapshot.lobby;
    const detail=lobby?.players.length<2?'Your fleet is locked in. Waiting for a second player.':lobby?.expectedGame?`Your fleet is locked in. Waiting for Draw #${lobby.expectedGame}.`:'Your fleet is locked in. Waiting for the active battle to finish.';
    showPopup('Fleet launched',detail,{className:'result-launch'});
  }
  catch(e){message(e.message+' Your placement is still saved here.');}
  finally{busy=false;render();}
};
for(const [id,value]of [['active-view','active'],['lobby-view','lobby']])$(id).onclick=()=>{if(placing){message('Finish launching your fleet before switching matches.');return;}mode=value;viewed=uid;stopAnimation();match=chooseMatch();visual=match;render();};
$('result-popup').addEventListener('cancel',e=>{if(pendingImpact)e.preventDefault();});
new ResizeObserver(()=>{if(snapshot){const shown=visual||match,player=placing?{hits:[]}:inspected(shown);renderShips(placing?draft:player?.fleet||[],player);}}).observe(board);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){stopAnimation();refresh();}});
window.addEventListener('online',refresh);
async function init(){
  try{
    if(!window.supabase)throw Error('Could not load the connection library. Reload when online.');
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{storageKey:'frontside-battleship-auth'}});
    let {data:{session},error}=await client.auth.getSession();if(error)throw error;
    if(!session){const signed=await client.auth.signInAnonymously();if(signed.error)throw Error('Player sign-in is not available. Enable Anonymous Sign-Ins in Supabase Auth.');session=signed.data.session;}
    uid=session.user.id;viewed=uid;$('player-name').value=storage.get('name')||'';
    try{const saved=JSON.parse(storage.get('draft'));if(Array.isArray(saved)&&saved.length===5&&saved.every((s,i)=>s.name===SPECS[i][0]&&s.length===SPECS[i][1]&&Array.isArray(s.cells)&&s.cells.every(n=>Number.isInteger(n)&&n>=1&&n<=80)))draft=saved;}catch{}
    await refresh();setInterval(refresh,15000);
  }catch(e){$('connection').textContent=e.message;}
}
init();
