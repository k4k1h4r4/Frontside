// Run with NODE_PATH pointing to a Playwright installation, then:
// node Arcade/leaderboard.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

(async () => {
  const root = path.resolve(__dirname,'..');
  const server = http.createServer((req,res) => {
    const filename = path.resolve(root,'.' + new URL(req.url,'http://localhost').pathname);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(filename,(error,contents) => {
      if (error) { res.writeHead(404).end(); return; }
      const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(filename)];
      res.setHeader('Content-Type',type || 'application/octet-stream'); res.end(contents);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({channel:process.env.TEST_BROWSER || 'chrome',headless:true});
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    const errors = [], submissions = [];
    let fail = false, qualifies = true;
    page.on('pageerror',error => errors.push(error.message));
    await context.route('**/*',async route => {
      const url = route.request().url();
      if (url.startsWith('https://znqnnaslskjewfxcswxw.supabase.co/rest/v1/rpc/')) {
        if (fail) return route.fulfill({status:503,body:'Unavailable'});
        if (url.endsWith('/arcade_submit')) {
          submissions.push(route.request().postDataJSON());
          return route.fulfill({body:'null'});
        }
        return route.fulfill({json: ['weekly','all-time'].flatMap(period => Array.from({length:5},(_,i) => ({period,rank:i+1,name:i===2?'Test Player':`Player ${i}`,score:100-i,is_player:qualifies && i===2})))});
      }
      if (!url.startsWith('http://127.0.0.1:')) return route.abort();
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}/Arcade/`;
    await page.goto(base+'perfectPour.html');
    // Nine pours must not submit; the tenth triggers the name prompt.
    await page.evaluate(() => { for (let i=1;i<=9;i++) { glass=i; state='pouring'; finish(.95); } });
    assert.equal(submissions.length,0);
    await page.evaluate(() => { glass=10; state='pouring'; finish(.95); });
    await page.getByLabel('Leaderboard name',{exact:true}).fill('  Test   Player  ');
    await page.getByRole('button',{name:'Save name',exact:true}).click();
    await page.getByRole('heading',{name:'Score: 950.0',exact:true}).waitFor();
    assert.equal(submissions.length,1);
    assert.equal(submissions[0].p_score,950);
    assert.equal(submissions[0].p_name,'Test Player');
    assert.equal(await page.locator('.lb-you').count(),2);
    assert.equal(await page.locator('.lb-dialog tbody tr').count(),10);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.screenshot({path:path.join(process.env.TEMP || root,'frontside-leaderboard-mobile.png')});
    await page.goto(base+'beerPong.html');
    await page.evaluate(() => { round=1; score=10; balls=10; winRound(); });
    assert.equal(submissions.length,1,'intermediate rounds do not submit');
    await page.evaluate(() => { round=11; score=155; balls=0; winRound(); });
    await page.getByRole('heading',{name:'Score: 155',exact:true}).waitFor();
    assert.equal(submissions.at(-1).p_game,'beer-pong');
    assert.equal(submissions.at(-1).p_score,155);
    assert.equal(await page.locator('.lb-dialog input').count(),0,'name persists between games');
    await page.goto(base+'beerPong.html');
    await page.evaluate(() => { score=4; loseRound(); });
    await page.getByRole('heading',{name:'Score: 4',exact:true}).waitFor();
    assert.equal(submissions.at(-1).p_score,4);
    await page.goto(base+'coasterStacking.html');
    fail = true;
    await page.evaluate(() => { score=7; stack=[{x:180,w:1}]; active={x:20,w:1,fromRight:false}; started=performance.now(); state='moving'; stop(started); });
    await page.waitForFunction(() => document.querySelector('.lb-notice').textContent.includes('queued'));
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('frontside.arcade.pending.v1')));
    assert.equal(pending.length,1); assert.equal(pending[0].score,7);
    fail = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('frontside.arcade.pending.v1')).length===0);
    assert.equal(submissions.at(-1).p_id,pending[0].id);
    qualifies = false;
    await page.evaluate(() => ArcadeLeaderboard.complete('coaster-stacking',3));
    assert.equal(await page.locator('dialog').evaluate(el => el.open),false);
    assert.match(await page.locator('.lb-notice').textContent(),/Score saved/);
    await page.goto(base+'arcade.html');
    await page.getByRole('button',{name:'High Scores',exact:true}).click();
    await page.getByRole('table',{name:'Weekly High Scores'}).waitFor();
    await page.getByLabel('Game',{exact:true}).selectOption('perfect-pour');
    await page.getByRole('table',{name:'All-Time High Scores'}).waitFor();
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: completion hooks, name persistence, Top 5 highlights, non-qualifying scores, offline retries, arcade browsing, mobile layout.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
