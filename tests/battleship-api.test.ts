// Exercise the actual Edge Function with in-memory platform and feed responses.
import { emptyState, gameState, joinLobby } from '../supabase/functions/battleship/engine.mjs';
function check(value: unknown,message='Assertion failed'): asserts value {if(!value)throw Error(message);}
const fleet=()=>[[1,2,3,4,5],[11,12,13,14],[21,22,23],[31,32,33],[41,42]].map(cells=>({cells}));
Deno.test('Battleship API modes, persistence, cleanup, feed failure and commit retries',async t=>{
  const originalFetch=globalThis.fetch,originalServe=Deno.serve;
  const previous=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BATTLESHIP_CRON_SECRET'].map(k=>[k,Deno.env.get(k)]));
  let handler:(r:Request)=>Promise<Response>=()=>{throw Error('Missing handler');};
  let state:any=emptyState(),version=0,feedDown=false,conflict=false,commits=0,feedRequests=0;
  let authUid='captain';
  const feedPosts=new Map<string,any>();let feedPostsDown=false;
  const archived=new Map<string,unknown>();
  Deno.env.set('SUPABASE_URL','https://database.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-service');Deno.env.set('BATTLESHIP_CRON_SECRET','test-cron');
  (Deno as any).serve=(fn:typeof handler)=>{handler=fn;return {};};
  globalThis.fetch=async(input:any,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id:authUid});
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
    if(url.includes('/rest/v1/live_feed_posts')){
      if(feedPostsDown)return new Response('down',{status:503});
      check(String((init?.headers as any)?.Prefer).includes('ignore-duplicates'),'win posts must ignore duplicates');
      for(const row of JSON.parse(String(init?.body)))if(!feedPosts.has(row.id))feedPosts.set(row.id,row);
      return new Response(null,{status:201});
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
      authUid='second';
      check((await request({...extension,requestId:'second-captain'})).status===200);
      check(Date.parse(state.games.rng.lobby.countdownEndsAt)===deadline+120000,'Second captain could not extend');
      authUid='captain';
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
    await t.step('status lists only the deployed fleets of the caller',async()=>{
      state=emptyState();state.last={raceid:100,racenumber:100,timestamp:new Date().toISOString()};
      const rng=gameState(state,'rng');rng.last={raceid:1,racenumber:1,timestamp:new Date().toISOString()};
      joinLobby(rng,{id:'captain',name:'Captain',fleet:fleet(),gameMode:'rng'},Date.now(),'r');
      const one=gameState(state,'live-1');one.last={raceid:100,racenumber:100,timestamp:new Date().toISOString()};
      joinLobby(one,{id:'someone',name:'Someone',fleet:fleet(),gameMode:'live-1'},Date.now(),'s');
      const reply=await request({action:'status',gameMode:'live-2'});
      check(reply.status===200,'status ok');
      check(JSON.stringify(reply.data.fleets)===JSON.stringify([{mode:'rng',where:'lobby'}]),'fleets: '+JSON.stringify(reply.data.fleets));
    });
    await t.step('public summary is read-only, needs no sign-in and reveals only counts',async()=>{
      const inner=globalThis.fetch,calls:string[]=[];
      globalThis.fetch=(input:any,init?:RequestInit)=>{calls.push(String(input));return inner(input,init);};
      const commitsBefore=commits,saved=JSON.stringify(state);
      try{
        const response=await handler(new Request('https://function.test/?action=summary'));
        check(response.status===200,'summary status');
        check(response.headers.get('Cache-Control')==='public, max-age=10','summary cache header');
        check(response.headers.get('Access-Control-Allow-Origin')==='*','summary CORS');
        const data=await response.json();
        check(data.rulesVersion===2&&typeof data.serverTime==='string','summary metadata');
        for(const mode of ['live-1','live-2','rng'])check(mode in data.modes,'summary mode '+mode);
        const text=JSON.stringify(data);
        check(!/fleet|cells|"name"|"id"/.test(text),'summary must not reveal names, ids or fleets');
        check(calls.length===1&&calls[0].endsWith('/battleship_read'),'summary only reads saved state: '+calls.join(', '));
        check(commits===commitsBefore&&JSON.stringify(state)===saved,'summary must not write');
        const other=await handler(new Request('https://function.test/?action=status'));
        check(other.status===405,'other GET actions still need POST');
      }finally{globalThis.fetch=inner;}
    });
    await t.step('a finished match posts one Live feed win, and a feed outage never breaks the game',async()=>{
      const id='22222222-2222-2222-2222-222222222222';
      const ships=(cells:number[][])=>cells.map(c=>({name:'S',length:c.length,cells:c}));
      const setup=()=>{
        state=emptyState();state.last={raceid:99,racenumber:99,timestamp:new Date().toISOString()};
        // The mock draw is balls 60-79: Bo loses two ships, Ann is untouched.
        state.active={id,status:'active',gameMode:'live-2',startGame:99,history:[],players:[
          {id:'ann',name:'Ann',fleet:ships([[1,2,3,4,5],[11,12,13,14],[21,22,23],[31,32,33],[41,42]]),hits:[],eliminated:null},
          {id:'bo',name:'Bo',fleet:ships([[61,62,63,64,65],[71,72,73,74],[1,11,21],[2,12,22],[3,13]]),hits:[],eliminated:null}]};
      };
      setup();feedPosts.clear();
      check((await request({action:'sync',gameMode:'live-2'},true)).status===200,'sync ok');
      check(feedPosts.size===1,'one win post');
      const post=feedPosts.get(id);
      check(post&&post.kind==='battleship-win'&&post.message==='Ann won Battleship Keno! (Live Keno · 2 ships)','win post content: '+JSON.stringify(post));
      check((await request({action:'sync',gameMode:'live-2'},true)).status===200);
      check(feedPosts.size===1,'no repeat post on the next sync');
      setup();feedPosts.clear();feedPostsDown=true;
      try{
        const reply=await request({action:'sync',gameMode:'live-2'},true);
        check(reply.status===200&&state.recent[0]?.id===id,'game still finishes when the feed is down');
      }finally{feedPostsDown=false;}
    });
  }finally{
    globalThis.fetch=originalFetch;(Deno as any).serve=originalServe;
    for(const [key,value]of Object.entries(previous))if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value);
  }
});
