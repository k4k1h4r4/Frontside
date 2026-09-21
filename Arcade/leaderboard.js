/* Shared leaderboard UI and automatic score submission; no Supabase SDK needed. */
(() => {
  'use strict';
  const games = {'beer-pong':'Beer Pong','perfect-pour':'Perfect Pour','coaster-stacking':'Coaster Stacking'};
  const NAME = 'frontside.arcade.name.v1', QUEUE = 'frontside.arcade.pending.v1';
  const config = {
    url: 'https://znqnnaslskjewfxcswxw.supabase.co',
    publicKey: 'sb_publishable_0pVZp5JcAc9lSIClZD5eqQ_9Q33F7Uf'
  };
  const configured = () => Boolean(config.url && config.publicKey);
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const validName = value => value && [...value].length <= 30 && !/[\x00-\x1f\x7f]/.test(value);
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  let player = read(NAME, '');
  if (typeof player !== 'string' || !validName(player)) player = '';
  let queue = read(QUEUE, []);
  if (!Array.isArray(queue)) queue = [];
  let flushing = null, busy = false, noticeTimer, viewVersion = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'lb-dialog';
  dialog.setAttribute('aria-label', 'Arcade high scores');
  const notice = document.createElement('div');
  notice.className = 'lb-notice'; notice.setAttribute('role','status'); notice.hidden = true;
  document.body.append(dialog, notice);
  function node(tag, text, parent = dialog) { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; }
  function toast(message) { notice.textContent = message; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500); }
  function open() { if (!dialog.open) dialog.showModal(); }
  function closeButton() { const button = node('button','Back to arcade'); button.className = 'lb-close'; button.onclick = () => dialog.close(); }
  function loading() { dialog.replaceChildren(); node('h2','High Scores'); node('p','Saving your score…').setAttribute('role','status'); open(); }
  async function rpc(name, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = {'Content-Type':'application/json', apikey:config.publicKey};
      if (config.publicKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.publicKey}`;
      const response = await fetch(`${config.url.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
      const text = await response.text(); return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timer); }
  }
  function askName() {
    if (player) return Promise.resolve(player);
    dialog.replaceChildren(); node('h2','Make a name for yourself');
    node('p','Enter your leaderboard name once. We’ll remember it on this browser and submit completed games automatically. Your name will be public.');
    const form = node('form',''), label = node('label','Leaderboard name',form), input = node('input','',label);
    input.required = true; input.maxLength = 30; input.autocomplete = 'nickname';
    const button = node('button','Save name',form); button.type = 'submit'; open(); input.focus();
    return new Promise(resolve => {
      const prevent = e => e.preventDefault(); dialog.addEventListener('cancel',prevent);
      form.onsubmit = e => {
        e.preventDefault(); const value = normalize(input.value);
        if (!validName(value)) { input.setCustomValidity('Enter a name from 1 to 30 characters.'); input.reportValidity(); return; }
        player = value; save(NAME,player); dialog.removeEventListener('cancel',prevent); resolve(player);
      };
      input.oninput = () => input.setCustomValidity('');
    });
  }
  function flush() {
    if (flushing) return flushing;
    if (!configured() || !player) return Promise.resolve();
    flushing = (async () => {
      for (const entry of [...queue]) {
        await rpc('arcade_submit',{p_id:entry.id,p_game:entry.game,p_name:entry.name || player,p_score:entry.score});
        queue = queue.filter(item => item.id !== entry.id); save(QUEUE,queue);
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  async function rows(game) { return await rpc('arcade_leaderboard',{p_game:game,p_name:player}) || []; }
  const formatScore = (game, score) => Number(score).toLocaleString(undefined,{minimumFractionDigits:game==='perfect-pour'?1:0,maximumFractionDigits:1});
  function render(game, data, currentScore = null) {
    dialog.replaceChildren(); node('h2',currentScore !== null ? `Score: ${formatScore(game,currentScore)}` : 'High Scores');
    const label = node('label','Game'), select = node('select','',label);
    select.setAttribute('aria-label','Game');
    for (const [key,title] of Object.entries(games)) { const option = node('option',title,select); option.value = key; }
    select.value = game; select.onchange = () => show(select.value);
    node('p','Weekly: Sunday–Saturday · One best score per name.');
    for (const [period,title] of [['weekly','Weekly High Scores'],['all-time','All-Time High Scores']]) {
      node('h3',title);
      const entries = data.filter(row => row.period === period);
      if (!entries.length) { node('p','No scores yet. Be the first!'); continue; }
      const table = node('table',''); table.setAttribute('aria-label',title);
      const header = node('tr','',node('thead','',table));
      for (const text of ['Rank','Name','Score']) node('th',text,header).scope = 'col';
      const body = node('tbody','',table);
      for (const entry of entries) {
        const row = node('tr','',body); if (entry.is_player) row.className = 'lb-you';
        node('td',`#${entry.rank}`,row); node('td',entry.name + (entry.is_player ? ' (you)' : ''),row);
        node('td',formatScore(game,entry.score),row);
      }
    }
    closeButton(); open();
  }
  async function show(game) {
    if (busy) return;
    const version = ++viewVersion;
    dialog.replaceChildren(); node('h2','High Scores'); node('p','Loading…'); closeButton(); open();
    try {
      if (!configured()) throw new Error('not configured');
      const data = await rows(game);
      if (version === viewVersion) render(game,data);
    } catch {
      if (version !== viewVersion) return;
      dialog.replaceChildren(); node('h2','High Scores'); node('p','Leaderboards are temporarily unavailable. Please check back soon.'); closeButton();
    }
  }
  async function complete(game, score) {
    if (!games[game] || !Number.isFinite(score) || score < 0 || busy) return;
    busy = true;
    ++viewVersion;
    const entry = {id:crypto.randomUUID(),game,score,name:player};
    queue.push(entry); save(QUEUE,queue);
    try {
      entry.name = await askName(); save(QUEUE,queue); loading();
      if (!configured()) throw new Error('not configured');
      await flush();
      // A prior background flush may have started before this run was queued.
      if (queue.some(item => item.id === entry.id)) await flush();
      const data = await rows(game);
      if (data.some(row => row.is_player)) render(game,data,score);
      else { dialog.close(); toast('Score saved. Keep playing for a Top 5 spot!'); }
    } catch {
      dialog.close();
      toast(queue.some(item => item.id === entry.id) ? 'Score queued. We’ll retry automatically when leaderboards are available.' : 'Score saved. Leaderboards are temporarily unavailable.');
    } finally { busy = false; }
  }
  dialog.addEventListener('cancel',e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close',() => { ++viewVersion; });
  function retry() { if (!busy) flush().catch(() => {}); }
  window.addEventListener('online',retry);
  setInterval(retry,30000); retry();
  const current = document.body.dataset.leaderboardGame || 'beer-pong';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'lb-open'; button.textContent = 'High Scores'; button.onclick = () => show(current);
  (document.querySelector('.screen-header') || document.querySelector('.site-head') || document.body).append(button);
  window.ArcadeLeaderboard = Object.freeze({complete,show});
})();
