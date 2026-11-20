import { advance, joinLobby, publicState, validateDraw, GAME_MODES, validateMode, gameState, pruneLobby, advanceSimulation, extendLobby } from './engine.mjs';
const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('BATTLESHIP_CRON_SECRET');

const BASE = 'https://kenocloud.com/kenocloud/casino/41/game/1/balldraw';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-battleship-cron','Access-Control-Allow-Methods':'POST, OPTIONS'};
async function rpc(name:string,args:Record<string,unknown>={}) {
  const r=await fetch(`${URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Game database unavailable. Check the Battleship migration.');
  return r.json();
}
async function fetchDraw(id:string|number){
  const r=await fetch(`${BASE}/${id}`,{signal:AbortSignal.timeout(10000),headers:{'Cache-Control':'no-cache'}});
  if(!r.ok)throw Error('Keno feed unavailable. No games were skipped.');
  return validateDraw(await r.json(),id==='latest'?undefined:id);
}
async function synchronize(state:any,cache:Map<number,any>,latest:any){
  if(!state.last){state.last={raceid:latest.raceid,racenumber:latest.racenumber,timestamp:latest.timestamp};return true;}
  if(latest.raceid<state.last.raceid)throw Error('Keno feed is behind saved history. Try again shortly.');
  if(!state.active&&!state.lobby){state.last={raceid:latest.raceid,racenumber:latest.racenumber,timestamp:latest.timestamp};return true;}
  const end=Math.min(latest.raceid,state.last.raceid+40);
  for(let id=state.last.raceid+1;id<=end;id++){
    if(!cache.has(id))cache.set(id,await fetchDraw(id));
    advance(state,cache.get(id));
  }
  return state.last.raceid===latest.raceid;
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  try{
    if(req.method!=='POST')return respond({error:'POST required.'},405);
    if(Number(req.headers.get('content-length'))>12000)return respond({error:'Request too large.'},413);
    const raw=await req.text();if(raw.length>12000)return respond({error:'Request too large.'},413);
    const body=JSON.parse(raw||'{}');
    const cron=!!SECRET&&req.headers.get('x-battleship-cron')===SECRET;
    let uid='';
    if(!cron){
      const bearer=req.headers.get('authorization')||'';
      const auth=await fetch(`${URL}/auth/v1/user`,{headers:{apikey:SERVICE,Authorization:bearer},signal:AbortSignal.timeout(10000)});
      if(!auth.ok)return respond({error:'Your session expired. Reload to reconnect.'},401);
      uid=(await auth.json()).id;
    }
    if(!['status','join','result','sync','extend'].includes(body.action))return respond({error:'Unknown action.'},400);
    if(body.action==='sync'&&!cron)return respond({error:'Worker access required.'},403);
    if(body.action==='result'){
      if(!/^[0-9a-f-]{36}$/i.test(body.matchId||''))return respond({error:'Invalid match ID.'},400);
      const result=await rpc('battleship_result',{match_id:body.matchId});
      return result?respond({match:result,uid}):respond({error:'Result not available yet.'},404);
    }
    if(!GAME_MODES.includes(body.gameMode??'live-2'))return respond({error:'Choose a valid game mode.'},400);
    const selected=validateMode(body.gameMode??'live-2');
    const cache=new Map();let latest:any=null,latestRequest:Promise<any>|null=null;
    for(let attempt=0;attempt<5;attempt++){
      const saved=await rpc('battleship_read');const state=saved.state;
      const now=Date.now();
      const readiness:Record<string,{caughtUp:boolean,warning:string}>={};
      // Expire every lobby, but synchronize only the requested mode.
      // Slow or unavailable live feeds must never delay simulated draws.
      for(const mode of GAME_MODES)pruneLobby(gameState(state,mode),now);
      for(const gameMode of [selected]){
        const lane=gameState(state,gameMode);
        pruneLobby(lane,now);
        let caughtUp=true,warning='';
        if(gameMode==='rng')caughtUp=advanceSimulation(lane,now);
        else{
          try{
            latestRequest??=fetchDraw('latest');latest=await latestRequest;cache.set(latest.raceid,latest);
            caughtUp=await synchronize(lane,cache,latest);
          }catch(e){caughtUp=false;warning=(e as Error).message;}
        }
        readiness[gameMode]={caughtUp,warning};
      }
      const {caughtUp,warning}=readiness[selected];
      let joinError='';
      if(body.action==='join'){
        if(!caughtUp||warning)joinError=warning||'Catching up missed draws. Try again shortly.';
        else if(selected!=='rng'&&Date.now()-Date.parse(latest.timestamp)>15*60*1000)
          joinError='Waiting for fresh Keno results before accepting fleets.';
        else{
          try{joinLobby(gameState(state,selected),{id:uid,name:body.name,fleet:body.fleet,gameMode:selected},now,crypto.randomUUID());}
          catch(e){joinError=(e as Error).message;}
        }
      }
      if(body.action==='extend'){
        try{extendLobby(gameState(state,selected),{id:uid,matchId:body.matchId,requestId:body.requestId},now);}
        catch(e){joinError=(e as Error).message;}
      }
      if(!await rpc('battleship_commit',{expected_version:saved.version,new_state:state}))continue;
      if(joinError)return respond({error:joinError},409);
      return respond({rulesVersion:2,state:publicState(gameState(state,selected),uid,state),uid,gameMode:selected,serverTime:new Date(now).toISOString(),caughtUp,warning,entriesEnabled:true});
    }
    return respond({error:'Another player updated the lobby. Please retry.'},409);
  }catch(e){console.error(e);return respond({error:(e as Error).message||'Could not update the game.'},503);}
});
