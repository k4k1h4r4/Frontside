// Exercise the actual Edge Function with in-memory platform and feed responses.
import { emptyState, gameState, joinLobby } from '../supabase/functions/battleship/engine.mjs';
function check(value: unknown,message='Assertion failed'): asserts value {if(!value)throw Error(message);}
const fleet=()=>[[1,2,3,4,5],[11,12,13,14],[21,22,23],[31,32,33],[41,42]].map(cells=>({cells}));
Deno.test('Battleship API modes, persistence, cleanup, feed failure and commit retries',async t=>{
  const originalFetch=globalThis.fetch,originalServe=Deno.serve;
  const previous=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BATTLESHIP_CRON_SECRET'].map(k=>[k,Deno.env.get(k)]));
  let handler:(r:Request)=>Promise<Response>=()=>{throw Error('Missing handler');};
  let state:any=emptyState(),version=0,feedDown=false,conflict=false,commits=0,feedRequests=0;
  const archived=new Map<string,unknown>();
  Deno.env.set('SUPABASE_URL','https://database.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-service');Deno.env.set('BATTLESHIP_CRON_SECRET','test-cron');
  (Deno as any).serve=(fn:typeof handler)=>{handler=fn;return {};};
  globalThis.fetch=async(input:any,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id:'captain'});
    if(url.includes('kenocloud.com')){
      feedRequests++;if(feedDown)throw Error('Feed offline');
      const id=url.endsWith('/latest')?100:Number(url.split('/').at(-1));
      return Response.json({raceid:id,racenumber:id,timestamp:new Date().toISOString(),balls:Array.from({length:20},(_,i)=>i+60)});
    }
    const body=JSON.parse(String(init?.body||'{}'));
    if(url.endsWith('/battleship_read'))return Response.json({version,state:structuredClone(state),updatedAt:new Date().toISOString()});
    if(url.endsWith('/battleship_commit')){
      commits++;
      if(conflict){conflict=false;version++;return Response.json(false);}
      check(body.expected_version===version,'Stale version submitted');
      state=body.new_state;version++;
      for(const lane of [state,...Object.values(state.games||{})] as any[])
        for(const m of lane.recent)archived.set(m.id,m);
      return Response.json(true);
    }
    if(url.endsWith('/battleship_result'))return Response.json(archived.get(body.match_id)||null);
    throw Error('Unexpected URL '+url);
  };
  const request=async(body:unknown,cron=false)=>{
    const response=await handler(new Request('https://function.test',{method:'POST',headers:{'Content-Type':'application/json',...(cron?{'x-battleship-cron':'test-cron'}:{Authorization:'Bearer test'})},body:JSON.stringify(body)}));
    return {status:response.status,data:await response.json()};
  };
  try{
    await import('../supabase/functions/battleship/index.ts');
    await t.step('default remains live-2 and status fetches the feed once',async()=>{
      const reply=await request({action:'status'});
      check(reply.status===200);check(reply.data.gameMode==='live-2');check(reply.data.rulesVersion===2);
      check(reply.data.state.games===undefined,'Other lanes leaked');check(feedRequests===1);
    });
    await t.step('join persists chosen mode and isolates lobby membership',async()=>{
      for(const mode of ['live-1','live-2','rng']){
        const reply=await request({action:'join',gameMode:mode,name:'Captain',fleet:fleet()});
        check(reply.status===200,JSON.stringify(reply.data));check(reply.data.state.lobby.gameMode===mode);
        check(reply.data.state.lobby.players.length===1);
      }
      check(state.lobby.gameMode==='live-2');check(state.games.rng.lobby.gameMode==='rng');
    });
    await t.step('RNG stays available through live feed outages',async()=>{
      feedDown=true;
      const before=feedRequests;
      const reply=await request({action:'status',gameMode:'rng'});
      check(reply.status===200);check(reply.data.caughtUp);check(!reply.data.warning);
      check(feedRequests===before,'RNG contacted the live feed');
      const live=await request({action:'join',gameMode:'live-1',name:'Captain',fleet:fleet()});
      check(live.status===409);feedDown=false;
    });
    await t.step('expired entries are removed and committed in every lane',async()=>{
      for(const mode of ['live-1','live-2','rng'])gameState(state,mode).lobby.players[0].joinedAt=new Date(Date.now()-3600001).toISOString();
      const reply=await request({action:'status',gameMode:'rng'});
      check(reply.status===200);
      for(const mode of ['live-1','live-2','rng'])check(gameState(state,mode).lobby===null);
    });
    await t.step('version conflict retries a join without duplicate captains',async()=>{
      conflict=true;const before=commits;
      const reply=await request({action:'join',gameMode:'rng',name:'Captain',fleet:fleet()});
      check(reply.status===200);check(commits===before+2);check(state.games.rng.lobby.players.length===1);
    });
    await t.step('cron advances RNG at server boundaries and does not start a solo lobby',async()=>{
      const lane=state.games.rng;
      lane.last.raceid-=2;lane.last.racenumber-=2;lane.lobby.startRaceId=lane.last.raceid+1;
      const reply=await request({action:'sync',gameMode:'rng'},true);
      check(reply.status===200);check(state.games.rng.active===null);
      check(state.games.rng.last.raceid===Math.floor(Date.now()/30000));
    });
    await t.step('RNG countdown extensions are authorized, persisted and idempotent across commit conflicts',async()=>{
      const lane=state.games.rng;
      joinLobby(lane,{id:'second',name:'Second',fleet:fleet(),gameMode:'rng'},Date.now(),'unused');
      const deadline=Date.parse(lane.lobby.countdownEndsAt),matchId=lane.lobby.id;
      check(deadline>Date.now()+59000,'Missing initial 60-second countdown');
      conflict=true;
      const extension={action:'extend',gameMode:'rng',matchId,requestId:'extension-1'};
      const reply=await request(extension);
      check(reply.status===200,JSON.stringify(reply.data));
      check(Date.parse(state.games.rng.lobby.countdownEndsAt)===deadline+60000);
      check((await request(extension)).status===200);
      check(Date.parse(state.games.rng.lobby.countdownEndsAt)===deadline+60000,'Duplicate extension added time');
      check((await request({...extension,matchId:'wrong'})).status===409);
      state.games.rng.lobby.players=state.games.rng.lobby.players.filter((p:any)=>p.id!=='captain');
      check((await request({...extension,requestId:'spectator'})).status===409);
    });
    await t.step('unauthorized sync requests cannot impersonate cron',async()=>{
      const reply=await request({action:'sync'});check(reply.status===403);
    });
    await t.step('invalid mode and incomplete fleets are rejected',async()=>{
      check((await request({action:'join',gameMode:'fake',name:'Captain',fleet:fleet()})).status===400);
      state.games.rng.lobby=null;
      check((await request({action:'join',gameMode:'rng',name:'Captain',fleet:fleet().slice(0,4)})).status===409);
    });
    await t.step('result lookup retains the archived game mode',async()=>{
      const id='11111111-1111-1111-1111-111111111111';archived.set(id,{id,gameMode:'rng',status:'finished'});
      const reply=await request({action:'result',matchId:id});check(reply.status===200);check(reply.data.match.gameMode==='rng');
    });
  }finally{
    globalThis.fetch=originalFetch;(Deno as any).serve=originalServe;
    for(const [key,value]of Object.entries(previous))if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value);
  }
});
