// Run with @electric-sql/pglite available through NODE_PATH.
const {PGlite} = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
(async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    await db.exec(fs.readFileSync(path.join(__dirname,'leaderboard.sql'),'utf8'));
    const submit = (name,score,game='beer-pong',id=randomUUID()) => db.query('select public.arcade_submit($1,$2,$3,$4)',[id,game,name,score]);
    const board = async (game='beer-pong',name='ALICE') => (await db.query('select * from public.arcade_leaderboard($1,$2)',[game,name])).rows;
    const id = randomUUID();
    await db.exec('set role anon');
    await submit(' Alice ',100,'beer-pong',id);
    await submit(' Alice ',100,'beer-pong',id);
    await submit('alice',99);
    await submit('ALICE',101);
    for (let i=0;i<6;i++) await submit(`Player ${i}`,90-i);
    const rows = await board();
    assert.equal(rows.length,10);
    for (const period of ['weekly','all-time']) {
      const entries=rows.filter(row => row.period===period);
      assert.equal(entries.length,5);
      assert.equal(entries[0].name,'ALICE');
      assert.equal(Number(entries[0].score),101);
      assert.equal(entries.filter(row => row.is_player).length,1);
    }
    await assert.rejects(() => db.query('select * from public.arcade_scores'),/permission denied/);
    await assert.rejects(() => submit(' ',5));
    await assert.rejects(() => submit('Player',-1));
    await assert.rejects(() => submit('Player',166));
    await assert.rejects(() => submit('Player',1.1));
    await assert.rejects(() => submit('Player',5,'unknown'));
    await submit('Pour Player',987.6,'perfect-pour');
    assert.equal(Number((await board('perfect-pour'))[0].score),987.6);
    await db.exec('reset role');
    assert.equal(Number((await db.query('select count(*) as n from public.arcade_scores where id=$1',[id])).rows[0].n),1);
    // An older personal best belongs only to all-time; duplicates cannot crowd out others.
    await db.query("insert into public.arcade_scores values ($1,'beer-pong','Alice',default,150,now()-interval '8 days')",[randomUUID()]);
    const split = await board();
    assert.equal(Number(split.find(row => row.period==='weekly').score),101);
    assert.equal(Number(split.find(row => row.period==='all-time').score),150);
    await submit('  Test   Person ',10,'coaster-stacking');
    await submit('test person',20,'coaster-stacking');
    assert.equal((await board('coaster-stacking','TEST PERSON')).length,2);
    // Exercise the exact weekly expression at a Sunday boundary and both DST transitions.
    for (const [instant,start,end] of [
      ['2026-09-20T05:59:59Z','2026-09-13T06:00:00Z','2026-09-20T06:00:00Z'],
      ['2026-09-20T06:00:00Z','2026-09-20T06:00:00Z','2026-09-27T06:00:00Z'],
      ['2026-03-08T12:00:00Z','2026-03-08T07:00:00Z','2026-03-15T06:00:00Z'],
      ['2026-11-01T12:00:00Z','2026-11-01T06:00:00Z','2026-11-08T07:00:00Z']
    ]) {
      const {rows:[bounds]} = await db.query("with b as (select date_trunc('week',$1::timestamptz at time zone 'America/Denver' + interval '1 day') - interval '1 day' as sunday) select sunday at time zone 'America/Denver' as start, (sunday + interval '7 days') at time zone 'America/Denver' as end from b",[instant]);
      assert.equal(new Date(bounds.start).toISOString(),new Date(start).toISOString());
      assert.equal(new Date(bounds.end).toISOString(),new Date(end).toISOString());
    }
    console.log('PASS: SQL migration, anonymous RPC permissions, Top 5 distinct names, independent weekly/all-time bests, idempotency, validation, timezone/DST boundaries.');
  } finally { await db.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
