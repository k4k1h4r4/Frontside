const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Behavior checks use a fixed hunt so editing real clues does not break CI.
const fixtureHunt = {
  id: 'frontside-time-hunt-v1', initialStep: 1,
  completionMessage: 'You have completed the scavenger hunt.',
  steps: [
    {step:1,message:'First test clue',destinationkey:'10212015'},
    {step:2,message:'Second test clue',destinationkey:'11051955'},
    {step:3,message:'Return to today',destinationkey:'currentdate'}
  ]
};
function dashboard(search = '', options = {}) {
  let now = new Date(2026,9,2,13,45);
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
  const elements = new Map();
  let playFailure = null;
  function element(key) {
    if (!elements.has(key)) {
      const classes = new Set();
      elements.set(key, { textContent:'', innerHTML:'', attributes:{}, listeners:{}, dataset:{}, disabled:false, open:false,
        currentTime:0, muted:true, paused:true, playCalls:0, loadCalls:0,
        load() { this.loadCalls++; },
        play() { this.playCalls++; if(playFailure) return Promise.reject(playFailure); this.paused=false; return Promise.resolve(); },
        pause() { this.paused=true; },
        focus() { this.focused=true; },
        showModal() { this.open=true; }, close() { this.open=false; if(this.listeners.close) this.listeners.close(); },
        classList:{ toggle(k,on) { if(on) classes.add(k); else classes.delete(k); }, contains:k=>classes.has(k) },
        setAttribute(k,v) { this.attributes[k]=v; }, getAttribute(k) { return this.attributes[k] ?? null; }, addEventListener(k,v) { this.listeners[k]=v; } });
    }
    return elements.get(key);
  }
  const buttons = [...'1234567890','clear','backspace'].map(key=>{ const b=element(`key-${key}`); b.dataset.key=key; return b; });
  const slots = [0,2,4].map(start=>{ const b=element(`slot-${start}`); b.dataset.start=String(start); return b; });
  const listeners = {};
  const storage = options.storage || new Map();
  const localStorage = {
    getItem:key=>{ if(options.blockStorage) throw new Error('Storage disabled'); return storage.get(key) || null; },
    setItem:(key,value)=>{ if(options.blockStorage) throw new Error('Storage disabled'); storage.set(key,value); }
  };
  const window = { localStorage, addEventListener:(name,fn)=>{ listeners[name]=fn; } };
  if (options.speech) {
    window.speechSynthesis = options.speech;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }
  const context = vm.createContext({
    window, Date:ClockDate, document:{ getElementById:element, querySelector:element, querySelectorAll:s=>s==='[data-key]'?buttons:slots },
    location:{ search }, URLSearchParams, setInterval:fn=>{ window.tick=fn; }
  });
  if (options.usePublishedConfig) {
    vm.runInContext(fs.readFileSync(require.resolve('../timetravel/timetravel-hunt-config.js'),'utf8'), context);
  } else window.TIME_HUNT_CONFIG = options.config || fixtureHunt;
  vm.runInContext(fs.readFileSync(require.resolve('../timetravel/timetravel.js'),'utf8'), context);
  return { api:window.timeCircuits, hunt:window.timeHunt, storage, element, listeners, tick:window.tick, key:k=>element(`key-${k}`).listeners.click(),
    clock:(y,m,d,h,min)=>{ now=new Date(y,m-1,d,h,min); window.tick(); },
    failPlayback:cause=>{ playFailure=cause; } };
}
test('destination starts fully blank, present is current, departed keeps 1985 default',()=>{
  const {api,element}=dashboard();
  assert.equal(api.get('destination'),null);
  assert.equal(api.get('present'),'2026-10-02T13:45');
  assert.equal(api.get('departed'),'1985-10-26T01:20');
  assert.equal(element('travel-button').disabled,true);
  assert.equal(element('engage-control').classList.contains('ready'),false);
  assert.equal(element('input-popup').open,false);
  assert.equal(element('year-entry').textContent,'____');
  assert.doesNotMatch(element('[data-circuit="destination"] .readout').innerHTML,/segment on/);
});
test('Input opens the keypad; confirming a valid date lights Engage without launching the video',()=>{
  const {api,key,element}=dashboard();
  element('open-input').listeners.click();
  assert.equal(element('input-popup').open,true);
  for(const d of '1021201') key(d);
  assert.equal(api.get('destination'),null);
  assert.equal(element('travel-button').disabled,true);
  key('5');
  assert.equal(element('month-entry').textContent,'10');
  assert.equal(element('day-entry').textContent,'21');
  assert.equal(element('year-entry').textContent,'2015');
  assert.equal(api.get('destination'),null);
  assert.equal(element('engage-control').classList.contains('ready'),false);
  assert.equal(element('submit-destination').disabled,false);
  element('submit-destination').listeners.click();
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  assert.equal(element('travel-button').disabled,false);
  assert.equal(element('engage-control').classList.contains('ready'),true);
  assert.equal(element('engage-status-text').textContent,'DESTINATION LOCKED');
  assert.equal(element('input-popup').open,false);
  assert.equal(element('travel-popup').open,false);
  assert.equal(element('ready-lamp').classList.contains('lit'),true);
});
test('travel records previous present, clears destination, and runs the clock on the chosen present date',()=>{
  const {api,clock,element}=dashboard();
  api.set('destination','10212015');
  clock(2026,10,2,13,46);
  element('travel-button').listeners.click();
  assert.equal(api.get('present'),'2015-10-21T13:46');
  assert.equal(api.get('departed'),'2026-10-02T13:46');
  assert.equal(api.get('destination'),null);
  assert.equal(element('year-entry').textContent,'____');
  assert.equal(element('engage-control').classList.contains('ready'),false);
  clock(2026,10,3,0,1);
  assert.equal(api.get('present'),'2015-10-21T00:01');
  assert.equal(api.get('departed'),'2026-10-02T13:46');
  const result = api.travel('11051955');
  assert.equal(api.get('present'),'1955-11-05T00:01');
  assert.equal(api.get('departed'),'2015-10-21T00:01');
  assert.equal(result.departed,'2015-10-21T00:01');
  assert.equal(api.get('destination'),null);
});
test('destination uses the current time; departed stays static',()=>{
  const {api,clock}=dashboard();
  api.set('destination','2015-10-21T02:00');
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  clock(2026,10,2,14,0);
  assert.equal(api.get('destination'),'2015-10-21T14:00');
  assert.equal(api.get('departed'),'1985-10-26T01:20');
});
test('invalid and empty trips preserve present and departed; leap dates are validated',()=>{
  const {api,key,element}=dashboard();
  assert.throws(()=>api.travel());
  for(const d of '02302026') key(d);
  assert.equal(api.get('destination'),null);
  assert.equal(element('travel-button').disabled,true);
  assert.match(element('input-error').textContent,/valid calendar date/);
  for(const d of ['02292025','13312026','00012026','01010000','2026-04-31']) assert.throws(()=>api.travel(d));
  assert.equal(api.get('present'),'2026-10-02T13:45');
  assert.equal(api.get('departed'),'1985-10-26T01:20');
  api.set('destination','02292024');
  assert.equal(api.get('destination'),'2024-02-29T13:45');
});
test('clear, backspace, and selected-field editing update entry',()=>{
  const {api,key,element}=dashboard();
  api.set('destination','10212015');
  key('backspace');
  assert.equal(element('year-entry').textContent,'201_');
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  assert.equal(element('submit-destination').disabled,true);
  key('4');
  element('submit-destination').listeners.click();
  assert.equal(api.get('destination'),'2014-10-21T13:45');
  element('slot-0').listeners.click();
  key('0'); key('7');
  element('submit-destination').listeners.click();
  assert.equal(api.get('destination'),'2014-07-21T13:45');
  element('slot-2').listeners.click();
  key('1'); key('5');
  element('submit-destination').listeners.click();
  assert.equal(api.get('destination'),'2014-07-15T13:45');
  key('clear');
  assert.equal(api.get('destination'),'2014-07-15T13:45');
  assert.equal(element('month-entry').textContent,'__');
});
test('closing the input popup discards edits and invalid entries cannot be confirmed',()=>{
  const {api,element,key}=dashboard();
  api.set('destination','10212015');
  element('open-input').listeners.click();
  key('clear');
  for(const d of '02302026') key(d);
  assert.equal(element('submit-destination').disabled,true);
  element('submit-destination').listeners.click();
  assert.equal(element('input-popup').open,true);
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  element('close-input').listeners.click();
  assert.equal(element('input-popup').open,false);
  element('open-input').listeners.click();
  assert.equal(element('month-entry').textContent,'10');
  assert.equal(element('day-entry').textContent,'21');
  assert.equal(element('year-entry').textContent,'2015');
  assert.equal(element('submit-destination').disabled,false);
});
test('all circuits accept variables and event updates validate before changing state',()=>{
  const {api,listeners,clock}=dashboard('?destination=10212015&present=11051955');
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  assert.equal(api.get('present'),'1955-11-05T13:45');
  listeners['timecircuits:update']({detail:{destination:'01012000',departed:'invalid'}});
  assert.equal(api.get('destination'),'2015-10-21T13:45');
  listeners['timecircuits:update']({detail:{destination:null,present:'07042000',departed:'1999-12-31T23:59'}});
  clock(2026,10,2,14,0);
  assert.equal(api.get('present'),'2000-07-04T14:00');
  assert.equal(api.get('departed'),'1999-12-31T23:59');
  assert.equal(api.get('destination'),null);
  api.resetPresent();
  assert.equal(api.get('present'),'2026-10-02T14:00');
});
test('travel opens the MP4 with sound and returns to circuits when the clip ends',()=>{
  const {api,element}=dashboard();
  api.travel('10212015');
  const popup=element('travel-popup');
  const video=element('travel-video');
  assert.equal(popup.open,true);
  assert.equal(video.currentTime,0);
  assert.equal(video.muted,false);
  assert.equal(video.playCalls,1);
  assert.equal(video.paused,false);
  video.listeners.playing();
  assert.equal(element('travel-caption').textContent,'');
  video.listeners.waiting();
  assert.match(element('travel-caption').textContent,/BUFFERING/);
  video.listeners.ended();
  assert.equal(popup.open,false);
  assert.equal(video.paused,true);
  assert.equal(api.get('present'),'2015-10-21T13:45');
  const html=fs.readFileSync(require.resolve('../timetravel.html'),'utf8');
  assert.match(html,/src="images\/bttf.webm"/);
  assert.match(html,/preload="metadata" playsinline/);
  assert.doesNotMatch(html.match(/<video\b[^>]*>/)[0],/\scontrols(?:\s|=|>)/);
  assert.ok(fs.statSync(require.resolve('../images/bttfTimeTravel.mp4')).size>0);
});
test('completion stops audio without undoing travel; later trips replay from the beginning',()=>{
  const {api,element}=dashboard();
  assert.throws(()=>api.travel('invalid'));
  assert.equal(element('travel-popup').open,false);
  api.travel('10212015');
  element('travel-video').currentTime=5;
  api.travel('11051955');
  assert.equal(element('travel-video').currentTime,0);
  assert.equal(element('travel-video').playCalls,2);
  element('travel-video').listeners.ended();
  assert.equal(element('travel-popup').open,false);
  assert.equal(element('travel-video').paused,true);
  assert.equal(api.get('present'),'1955-11-05T13:45');
});

test('each successful transition uses the departing step clip, including shared and final clips',()=>{
  const config={...fixtureHunt,steps:fixtureHunt.steps.map((step,index)=>({...step,clip:index<2?'images/shared.mp4':'images\\final.mp4'}))};
  const game=dashboard('',{config});
  const video=game.element('travel-video');
  assert.equal(game.api.travel('01012000').success,false);
  assert.equal(video.loadCalls,0);
  game.api.travel('10212015');
  assert.equal(video.getAttribute('src'),'images/shared.mp4');
  assert.equal(game.hunt.getState().step,2);
  assert.equal(video.loadCalls,1);
  game.element('travel-video').listeners.ended();
  video.currentTime=10;
  game.api.travel('11051955');
  assert.equal(video.getAttribute('src'),'images/shared.mp4');
  assert.equal(video.currentTime,0);
  assert.equal(video.loadCalls,1);
  game.element('travel-video').listeners.ended();
  game.api.travel('10022026');
  assert.equal(video.getAttribute('src'),'images/final.mp4');
  assert.equal(video.loadCalls,2);
  assert.equal(video.playCalls,3);
  assert.equal(game.hunt.getState().completed,true);
});

test('missing clip settings use the existing video and invalid settings are rejected',()=>{
  const game=dashboard();
  game.api.travel('10212015');
  assert.equal(game.element('travel-video').getAttribute('src'),'images/bttfTimeTravel.mp4');
  for (const clip of ['', '  ', null, 123]) {
    const config={...fixtureHunt,steps:[{...fixtureHunt.steps[0],clip}]};
    assert.throws(()=>dashboard('',{config}),/non-empty file path/);
  }
});
test('blocked playback offers a fresh play tap, and stale rejections cannot reopen it',async()=>{
  const {api,element,failPlayback}=dashboard();
  failPlayback({name:'NotAllowedError'});
  api.travel('10212015');
  await Promise.resolve();
  assert.equal(element('play-travel-video').hidden,false);
  assert.match(element('travel-caption').textContent,/TAP PLAY/);
  failPlayback(null);
  element('play-travel-video').listeners.click();
  assert.equal(element('play-travel-video').hidden,true);
  assert.equal(element('travel-video').paused,false);
  failPlayback({name:'NotAllowedError'});
  api.travel('11051955');
  element('travel-video').listeners.ended();
  await Promise.resolve();
  assert.equal(element('play-travel-video').hidden,true);
  assert.equal(element('travel-popup').open,false);
});
test('media errors automatically close the transition without trapping players',()=>{
  const {api,element}=dashboard();
  api.travel('10212015');
  element('travel-video').listeners.error();
  assert.equal(element('travel-popup').open,false);
  assert.equal(element('travel-video').paused,true);
  assert.equal(api.get('present'),'2015-10-21T13:45');
});
test('Message blinks until opened, remembers reading, and alerts again for the next clue or restart',()=>{
  const game=dashboard();
  const unread=app=>app.element('open-message').classList.contains('unread');
  assert.equal(unread(game),true);
  game.element('open-message').listeners.click();
  assert.equal(unread(game),false);
  game.element('close-message').listeners.click();
  const resumed=dashboard('',{storage:game.storage});
  assert.equal(unread(resumed),false);
  resumed.api.travel('10212015');
  assert.equal(unread(resumed),true);
  const next=dashboard('',{storage:resumed.storage});
  assert.equal(unread(next),true);
  next.element('open-message').listeners.click();
  assert.equal(unread(next),false);
  next.hunt.reset();
  assert.equal(unread(next),true);
  next.hunt.setStep(3);
  next.api.travel('10022026');
  assert.equal(unread(next),false);
});

test('Message shows the current clue and the hunt starts at step one',()=>{
  const {hunt,element}=dashboard();
  assert.equal(hunt.getState().step,1);
  assert.equal(hunt.getState().destinationkey,'10212015');
  element('open-message').listeners.click();
  assert.equal(element('message-popup').open,true);
  assert.equal(element('hunt-message').textContent,hunt.getState().message);
  assert.equal(element('message-title').textContent,'MESSAGE 1');
  element('close-message').listeners.click();
  assert.equal(element('message-popup').open,false);
});

test('speech follows unread clues, persists across reload, and resets with the hunt',()=>{
  const spoken=[];
  const speech={speak:utterance=>spoken.push(utterance),cancel() {}};
  const game=dashboard('',{speech});
  assert.equal(spoken.length,0);
  game.element('open-message').listeners.click();
  assert.equal(spoken.length,1);
  assert.equal(spoken[0].text,game.hunt.getState().message);
  assert.equal(spoken[0].lang,'en-US');
  game.element('close-message').listeners.click();
  game.element('open-message').listeners.click();
  assert.equal(spoken.length,1);
  const resumed=dashboard('',{speech,storage:game.storage});
  resumed.element('open-message').listeners.click();
  assert.equal(spoken.length,1);
  resumed.api.travel('10212015');
  assert.equal(spoken.length,1);
  resumed.element('open-message').listeners.click();
  assert.equal(spoken.length,2);
  assert.equal(spoken[1].text,'Second test clue');
  resumed.hunt.reset();
  resumed.element('open-message').listeners.click();
  assert.equal(spoken.length,3);
  resumed.hunt.setStep(3);
  resumed.api.travel('10022026');
  resumed.element('open-message').listeners.click();
  assert.equal(spoken.length,3);
});

test('closing, dismissing, advancing, resetting, and leaving stop message speech',()=>{
  let cancelled=0;
  const speech={speak() {},cancel() { cancelled++; }};
  const game=dashboard('',{speech});
  const open=()=>game.element('open-message').listeners.click();
  open();
  game.element('close-message').listeners.click();
  assert.equal(cancelled,1);
  game.hunt.reset(); open();
  game.element('message-popup').listeners.cancel();
  game.element('message-popup').close();
  assert.equal(cancelled,2);
  game.hunt.reset(); open();
  game.api.travel('10212015');
  assert.equal(cancelled,3);
  open(); game.hunt.setStep(3);
  assert.equal(cancelled,4);
  open(); game.hunt.reset();
  assert.equal(cancelled,5);
  open(); game.listeners.pagehide();
  assert.equal(cancelled,6);
});

test('unavailable or failed speech leaves the message readable and stops blinking',()=>{
  for (const speech of [undefined,{speak() { throw new Error('Speech unavailable'); },cancel() {}}]) {
    const game=dashboard('',{speech});
    assert.doesNotThrow(()=>game.element('open-message').listeners.click());
    assert.equal(game.element('message-popup').open,true);
    assert.equal(game.element('hunt-message').textContent,'First test clue');
    assert.equal(game.element('open-message').classList.contains('unread'),false);
  }
});
test('wrong destinations show failure, preserve the step and circuits, and can be corrected',()=>{
  const {api,hunt,element}=dashboard();
  api.set('destination','01012000');
  const before=['destination','present','departed'].map(api.get);
  assert.equal(api.travel().success,false);
  assert.deepEqual(['destination','present','departed'].map(api.get),before);
  assert.equal(hunt.getState().step,1);
  assert.equal(element('failure-popup').open,true);
  assert.equal(element('travel-popup').open,false);
  assert.equal(element('travel-video').playCalls,0);
  assert.equal(element('engage-control').classList.contains('ready'),true);
  element('retry-input').listeners.click();
  assert.equal(element('failure-popup').open,false);
  assert.equal(element('input-popup').open,true);
});
test('correct travel advances the clue and browser storage resumes progress and circuits',()=>{
  const first=dashboard();
  const previousMessage=first.hunt.getState().message;
  first.api.travel('10212015');
  assert.equal(first.hunt.getState().step,2);
  assert.equal(first.element('message-title').textContent,'MESSAGE 2');
  assert.notEqual(first.hunt.getState().message,previousMessage);
  assert.equal(first.hunt.getState().destinationkey,'11051955');
  const saved=JSON.parse([...first.storage.values()][0]);
  assert.equal(saved.step,2);
  assert.equal(saved.message,first.hunt.getState().message);
  assert.equal(saved.destinationkey,'11051955');
  const resumed=dashboard('',{storage:first.storage});
  assert.equal(resumed.hunt.getState().step,2);
  assert.equal(resumed.hunt.getState().message,first.hunt.getState().message);
  assert.equal(resumed.api.get('present'),'2015-10-21T13:45');
  assert.equal(resumed.api.get('departed'),'2026-10-02T13:45');
  assert.equal(resumed.element('travel-popup').open,false);
  assert.equal(resumed.api.travel('10212015').success,false);
  resumed.element('close-failure').listeners.click();
  assert.equal(resumed.api.travel('11051955').success,true);
});
test('last step completes the hunt, stays completed after reload, and supports reset',()=>{
  const first=dashboard();
  first.api.travel('10212015');
  first.api.travel('11051955');
  assert.equal(first.hunt.getState().destinationkey,'10022026');
  assert.equal(first.api.travel('11051955').success,false);
  first.element('close-failure').listeners.click();
  first.api.travel('10022026');
  assert.equal(first.api.get('present'),'2026-10-02T13:45');
  assert.equal(first.element('completion-popup').open,false);
  first.element('travel-video').listeners.ended();
  assert.equal(first.element('completion-popup').open,true);
  assert.equal(first.hunt.getState().completed,true);
  assert.equal(first.element('hunt-progress').textContent,'HUNT COMPLETE');
  const resumed=dashboard('',{storage:first.storage});
  assert.equal(resumed.hunt.getState().completed,true);
  assert.equal(resumed.element('travel-button').disabled,true);
  assert.equal(resumed.api.travel('11051955').success,false);
  assert.equal(resumed.element('completion-popup').open,true);
  assert.match(resumed.element('hunt-message').textContent,/completed the scavenger hunt/);
  resumed.hunt.reset();
  assert.equal(resumed.hunt.getState().step,1);
  assert.equal(resumed.hunt.getState().completed,false);
  assert.equal(resumed.api.get('present'),'2026-10-02T13:45');
  assert.equal(resumed.api.get('departed'),'1985-10-26T01:20');
});
test('final destination follows the local date across midnight and completion appears when the clip ends',()=>{
  const game=dashboard();
  game.hunt.setStep(3);
  game.api.set('destination','10022026');
  game.clock(2026,10,3,0,1);
  assert.equal(game.hunt.getState().destinationkey,'10032026');
  assert.equal(game.api.travel().success,false);
  game.element('close-failure').listeners.click();
  assert.equal(game.api.travel('10032026').success,true);
  game.element('travel-video').listeners.ended();
  assert.equal(game.element('completion-popup').open,true);
  assert.equal(game.element('travel-video').paused,true);
  game.element('close-completion').listeners.click();
  game.clock(2026,10,4,0,2);
  assert.equal(game.api.get('present'),'2026-10-04T00:02');
  game.element('open-message').listeners.click();
  assert.equal(game.element('completion-popup').open,true);
});

test('completion restart button restores step one and default circuits, including after reload',()=>{
  const game=dashboard();
  game.api.travel('10212015');
  game.api.travel('11051955');
  game.api.travel('10022026');
  game.element('travel-video').listeners.ended();
  game.element('restart-mission').listeners.click();
  assert.equal(game.element('completion-popup').open,false);
  assert.equal(game.hunt.getState().step,1);
  assert.equal(game.hunt.getState().completed,false);
  assert.equal(game.api.get('destination'),null);
  assert.equal(game.api.get('present'),'2026-10-02T13:45');
  assert.equal(game.api.get('departed'),'1985-10-26T01:20');
  assert.equal(game.element('travel-button').disabled,true);
  const resumed=dashboard('',{storage:game.storage});
  assert.equal(resumed.hunt.getState().step,1);
  assert.equal(resumed.hunt.getState().completed,false);
  resumed.element('open-message').listeners.click();
  assert.equal(resumed.element('message-title').textContent,'MESSAGE 1');
});

test('configured steps can be selected, and malformed or disabled storage does not break play',()=>{
  const custom={id:'test',initialStep:1,steps:[
    {step:1,message:'First custom clue',destinationkey:'01012000'},
    {step:2,message:'Second custom clue',destinationkey:'02022002'}
  ]};
  const first=dashboard('',{config:custom});
  assert.equal(first.hunt.getState().message,'First custom clue');
  first.hunt.setStep(2);
  assert.equal(first.hunt.getState().message,'Second custom clue');
  assert.throws(()=>first.hunt.setStep(999));
  const resumed=dashboard('',{storage:first.storage,config:custom});
  assert.equal(resumed.hunt.getState().step,2);
  const corrupt=new Map([['timetravel:hunt:frontside-time-hunt-v1','{bad json']]);
  assert.equal(dashboard('',{storage:corrupt}).hunt.getState().step,1);
  const blocked=dashboard('',{blockStorage:true});
  assert.equal(blocked.api.travel('10212015').success,true);
});
test('saved zero-based progress migrates to the same clue with one-based numbering',()=>{
  const old={schema:1,step:1,message:'Old second clue',destinationkey:'11051955',completed:false,presentDate:'2015-10-21',departed:'2026-10-02T13:45',destination:null};
  const storage=new Map([['timetravel:hunt:frontside-time-hunt-v1',JSON.stringify(old)]]);
  const resumed=dashboard('',{storage});
  assert.equal(resumed.hunt.getState().step,2);
  assert.equal(resumed.hunt.getState().destinationkey,'11051955');
  assert.equal(resumed.element('message-title').textContent,'MESSAGE 2');
  assert.equal(resumed.api.get('present'),'2015-10-21T13:45');
  assert.equal(JSON.parse([...storage.values()][0]).schema,2);
});
test('page uses the supplied centered logo and Frontside navigation without a footer',()=>{
  const html=fs.readFileSync(require.resolve('../timetravel.html'),'utf8');
  assert.match(html,/src="images\/backtothefrontside.webp"/);
  assert.match(html,/href="nav.css"/);
  assert.match(html,/src="nav.js"/);
  assert.match(html,/data-site-nav/);
  assert.doesNotMatch(html,/<footer/);
});
test('root timetravel page references existing assets after the move',()=>{
  const path=require('node:path');
  const page=require.resolve('../timetravel.html');
  const html=fs.readFileSync(page,'utf8');
  for(const [,asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if(/^(?:https?:|#)/.test(asset)) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(page),asset.split('?')[0])),`Missing page asset: ${asset}`);
  }
  assert.match(html,/src="timetravel\/timetravel.js"/);
  assert.match(html,/href="timetravel\/timetravel.css"/);
  const assets=fs.readdirSync(path.dirname(require.resolve('../timetravel/timetravel.js')));
  assert.ok(assets.every(name=>name.startsWith('timetravel')),`Unexpected asset name: ${assets}`);
});
test('progress saved under the old storage name migrates to the new key',()=>{
  const legacyKey='time-circuits:hunt:frontside-time-hunt-v1';
  const saved={schema:2,step:2,completed:false,presentDate:'2015-10-21',departed:'2026-10-02T13:45',destination:null};
  const storage=new Map([[legacyKey,JSON.stringify(saved)]]);
  const resumed=dashboard('',{storage});
  assert.equal(resumed.hunt.getState().step,2);
  assert.equal(resumed.api.get('present'),'2015-10-21T13:45');
  assert.equal(JSON.parse(storage.get('timetravel:hunt:frontside-time-hunt-v1')).step,2);
});
test('published hunt configuration has valid steps, dates, and an existing initialStep',()=>{
  // App initialization validates every configured step, without assuming any
  // specific clue text, answer, number of steps, or hunt id.
  const configured=dashboard('',{usePublishedConfig:true});
  const state=configured.hunt.getState();
  assert.ok(state.step>=1);
  assert.equal(typeof state.message,'string');
  assert.match(state.destinationkey,/^\d{8}$/);
  assert.equal(state.completed,false);
});

test('Start plays the fixed opening film before revealing the game without advancing the clue',()=>{
  const game=dashboard();
  assert.equal(game.element('start-screen').hidden,false);
  assert.equal(game.element('game-console').hidden,true);
  assert.equal(game.element('game-nav').hidden,true);
  assert.equal(game.element('travel-video').playCalls,0);
  game.element('start-game').listeners.click();
  game.element('start-game').listeners.click();
  const video=game.element('travel-video');
  assert.equal(video.getAttribute('src'),'images/bttf.webm');
  assert.equal(video.playCalls,1);
  assert.equal(video.muted,false);
  assert.equal(game.element('travel-popup').open,true);
  assert.equal(game.element('game-console').hidden,true);
  assert.equal(game.hunt.getState().step,1);
  video.listeners.ended();
  assert.equal(game.element('travel-popup').open,false);
  assert.equal(game.element('start-screen').hidden,true);
  assert.equal(game.element('game-console').hidden,false);
  assert.equal(game.element('game-nav').hidden,false);
  assert.equal(game.element('open-message').focused,true);
  assert.equal(game.element('open-message').classList.contains('unread'),true);
  assert.equal(game.hunt.getState().step,1);
  game.api.travel('10212015');
  assert.equal(video.getAttribute('src'),'images/bttfTimeTravel.mp4');
  assert.equal(game.element('travel-title').textContent,'TIME TRAVEL IN PROGRESS');
});

test('saved games resume directly, while unfinished starts and restarted missions show Start',()=>{
  const game=dashboard();
  assert.equal(dashboard('',{storage:game.storage}).element('start-screen').hidden,false);
  game.element('start-game').listeners.click();
  game.element('travel-video').listeners.ended();
  const resumed=dashboard('',{storage:game.storage});
  assert.equal(resumed.element('start-screen').hidden,true);
  assert.equal(resumed.element('game-console').hidden,false);
  assert.equal(resumed.element('travel-video').playCalls,0);
  resumed.hunt.reset();
  assert.equal(resumed.element('start-screen').hidden,false);
  assert.equal(resumed.element('game-console').hidden,true);
  assert.equal(dashboard('',{storage:resumed.storage}).element('start-screen').hidden,false);
  resumed.element('start-game').listeners.click();
  assert.equal(resumed.element('travel-video').getAttribute('src'),'images/bttf.webm');
});

test('opening film handles blocked playback and unavailable media without trapping players',async()=>{
  const game=dashboard('',{blockStorage:true});
  game.failPlayback({name:'NotAllowedError'});
  game.element('start-game').listeners.click();
  await Promise.resolve();
  assert.equal(game.element('play-travel-video').hidden,false);
  assert.equal(game.element('game-console').hidden,true);
  game.failPlayback(null);
  game.element('play-travel-video').listeners.click();
  game.element('travel-video').listeners.error();
  assert.equal(game.element('travel-popup').open,false);
  assert.equal(game.element('game-console').hidden,false);
});


