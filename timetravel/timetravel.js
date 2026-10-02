(() => {
  'use strict';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  // Fourteen vector segments keep both month letters and numerals editable.
  const paths = {
    a:'M7 2 L27 2 L23 6 L10 6 Z', b:'M28 3 L27 20 L23 23 L24 8 Z',
    c:'M27 25 L25 43 L21 39 L23 28 Z', d:'M5 44 L24 44 L20 40 L9 40 Z',
    e:'M2 26 L6 29 L5 38 L2 43 Z', f:'M5 3 L8 8 L7 20 L3 23 Z',
    g:'M5 21 L15 21 L17 23 L14 25 L4 25 Z', h:'M18 21 L25 21 L27 23 L24 25 L17 25 Z',
    i:'M10 7 L14 10 L16 20 L13 19 Z', j:'M17 7 L20 7 L19 20 L16 20 Z',
    k:'M23 7 L23 12 L20 20 L17 20 Z', l:'M13 26 L16 26 L9 38 L6 38 Z',
    m:'M16 26 L19 26 L18 39 L15 39 Z', n:'M20 27 L23 30 L23 39 L20 36 Z'
  };
  const glyphs = {0:'abcdef',1:'bc',2:'abghde',3:'abghcd',4:'fbghc',5:'afghcd',6:'afghcde',7:'abc',8:'abcdefgh',9:'abfghcd',
    A:'abcefgh',B:'abcdhjm',C:'afed',D:'abcdjm',E:'afghde',F:'afghe',G:'afedch',H:'bcefgh',I:'adjm',J:'bcde',K:'efgkn',L:'fed',M:'fbceik',N:'fbcein',O:'abcdef',P:'abfghe',Q:'abcdefn',R:'abfg hen'.replaceAll(' ',''),S:'afghcd',T:'ajm',U:'bcdef',V:'fekl',W:'bcfeln',X:'ikln',Y:'ikm',Z:'akld'};
  const names = ['destination','present','departed'];
  const values = {};
  const error = document.getElementById('input-error');
  const travelButton = document.getElementById('travel-button');
  const inputPopup = document.getElementById('input-popup');
  const submitDestination = document.getElementById('submit-destination');
  const readyLamp = document.getElementById('ready-lamp');
  const travelPopup = document.getElementById('travel-popup');
  const travelVideo = document.getElementById('travel-video');
  const playVideoButton = document.getElementById('play-travel-video');
  const travelCaption = document.getElementById('travel-caption');
  let playbackAttempt = 0;
  let presentDate = null;
  let entry = Array(8).fill('');
  let cursor = 0;
  const pad = number => String(number).padStart(2, '0');
  const localValue = date => `${String(date.getFullYear()).padStart(4,'0')}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const huntConfig = window.TIME_HUNT_CONFIG;
  if (!huntConfig || !Array.isArray(huntConfig.steps) || !huntConfig.steps.length) throw new Error('Define at least one step in timetravel-hunt-config.js.');
  const stepNumbers = new Set();
  const huntSteps = huntConfig.steps.map(item => {
    if (!Number.isInteger(item.step) || item.step < 1 || stepNumbers.has(item.step) || typeof item.message !== 'string' || !/^\d{8}$/.test(item.destinationkey)) throw new Error('Each hunt step needs a unique step number starting at 1, message, and MMDDYYYY destinationkey.');
    parse(item.destinationkey);
    stepNumbers.add(item.step);
    return Object.freeze({ step: item.step, message: item.message, destinationkey: item.destinationkey });
  }).sort((a,b) => a.step - b.step);
  const initialIndex = huntSteps.findIndex(item => item.step === (huntConfig.initialStep ?? 1));
  if (initialIndex < 0) throw new Error('initialStep must match a configured hunt step.');
  const storageKey = `timetravel:hunt:${huntConfig.id || 'default'}`;
  // Read the pre-rename key once so existing players keep their progress.
  const legacyStorageKey = `time-circuits:hunt:${huntConfig.id || 'default'}`;
  let huntIndex = initialIndex;
  let huntCompleted = false;
  let restoring = true;
  const messagePopup = document.getElementById('message-popup');
  const failurePopup = document.getElementById('failure-popup');
  function huntState() {
    return { ...huntSteps[huntIndex], completed: huntCompleted };
  }
  function refreshHunt() {
    const state = huntState();
    document.getElementById('hunt-progress').textContent = state.completed ? 'HUNT COMPLETE' : `STEP ${state.step}`;
    document.getElementById('message-title').textContent = state.completed ? 'HUNT COMPLETE' : `MESSAGE ${state.step}`;
    document.getElementById('hunt-message').textContent = state.completed ? (huntConfig.completionMessage || 'You have completed the scavenger hunt!') : state.message;
    syncEntry();
  }
  function saveHunt() {
    if (restoring) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ schema: 2, ...huntState(), presentDate, destination: values.destination, departed: values.departed }));
    } catch { /* The hunt remains playable when browser storage is unavailable. */ }
  }
  function changeStep(step) {
    const index = huntSteps.findIndex(item => item.step === step);
    if (index < 0) throw new RangeError(`Unknown hunt step: ${step}`);
    huntIndex = index;
    huntCompleted = false;
    set('destination', null);
    refreshHunt();
    saveHunt();
    return huntState();
  }
  function parse(value) {
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new TypeError('Invalid date.');
      value = localValue(value);
    }
    if (typeof value === 'string' && /^\d{8}$/.test(value)) value = `${value.slice(4)}-${value.slice(0,2)}-${value.slice(2,4)}`;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += `T${localValue(new Date()).slice(11)}`;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new TypeError('Enter a date as MMDDYYYY, YYYY-MM-DD, or a Date object.');
    const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, 0, 0);
    if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError('Enter a valid calendar date (MMDDYYYY).');
    return { year, month, day, hour, minute, value };
  }
  function digits(text) {
    return [...text].map(char => `<svg class="digit" viewBox="0 0 30 46" aria-hidden="true">${Object.entries(paths).map(([key,path]) => `<path class="segment${(glyphs[char] || '').includes(key) ? ' on' : ''}" d="${path}"/>`).join('')}</svg>`).join('');
  }
  function render(name, date) {
    const parts = date ? [months[date.month-1], pad(date.day), String(date.year).padStart(4,'0'), pad(date.hour % 12 || 12), pad(date.minute)] : ['   ','  ','    ','  ','  '];
    const labels = ['MONTH','DAY','YEAR','HOUR','MIN'];
    const target = document.querySelector(`[data-circuit="${name}"] .readout`);
    target.setAttribute('role','img');
    target.setAttribute('aria-label', date ? `${parts[0]} ${date.day}, ${date.year}, ${parts[3]}:${parts[4]} ${date.hour < 12 ? 'AM' : 'PM'}` : 'No destination set');
    target.innerHTML = parts.map((part,index) => `<div class="field"><span class="field-label" aria-hidden="true">${labels[index]}</span>${index === 3 ? `<div class="hour-display"><div class="meridiem" aria-hidden="true"><span class="${date && date.hour<12?'active':''}">AM<i></i></span><span class="${date && date.hour>=12?'active':''}">PM<i></i></span></div>` : ''}<div class="screen">${digits(part)}</div>${index === 3 ? '</div>' : ''}</div>`).join('');
  }
  function set(name, value) {
    if (!names.includes(name)) throw new RangeError(`Unknown circuit: ${name}`);
    if (name === 'destination' && (value === null || value === '')) {
      values.destination = null;
      entry = Array(8).fill('');
      cursor = 0;
      render(name, null);
      syncEntry();
      saveHunt();
      return null;
    }
    const date = parse(value);
    if (name === 'present') presentDate = date.value.slice(0,10);
    const normalized = name === 'departed' ? date.value : `${date.value.slice(0,10)}T${localValue(new Date()).slice(11)}`;
    values[name] = normalized;
    render(name, parse(normalized));
    if (name === 'destination') {
      entry = [...`${pad(date.month)}${pad(date.day)}${String(date.year).padStart(4,'0')}`];
      cursor = 8;
      syncEntry();
    }
    error.textContent = '';
    saveHunt();
    return normalized;
  }
  function travel(destination = values.destination) {
    if (!destination) throw new RangeError('Enter a complete destination date first.');
    const date = parse(destination);
    if (huntCompleted) {
      if (!messagePopup.open) messagePopup.showModal();
      return { success: false, completed: true };
    }
    const destinationkey = `${pad(date.month)}${pad(date.day)}${String(date.year).padStart(4,'0')}`;
    if (destinationkey !== huntSteps[huntIndex].destinationkey) {
      if (inputPopup.open) inputPopup.close();
      if (!failurePopup.open) failurePopup.showModal();
      return { success: false, step: huntSteps[huntIndex].step };
    }
    const selected = date.value.slice(0,10);
    const arrival = `${selected}T${localValue(new Date()).slice(11)}`;
    tick();
    const departure = values.present;
    set('departed', departure);
    set('present', arrival);
    set('destination', null);
    if (huntIndex + 1 < huntSteps.length) huntIndex++;
    else huntCompleted = true;
    refreshHunt();
    saveHunt();
    if (inputPopup.open) inputPopup.close();
    animateTravel();
    return { success: true, destination: null, present: arrival, departed: departure, ...huntState() };
  }
  function animateTravel() {
    stopTravelAnimation();
    travelVideo.currentTime = 0;
    travelVideo.muted = false;
    travelCaption.textContent = 'LOADING TIME TRAVEL CLIP…';
    if (!travelPopup.open) travelPopup.showModal();
    playTravelVideo();
  }
  function playTravelVideo() {
    const attempt = ++playbackAttempt;
    playVideoButton.hidden = true;
    // Call play synchronously within the user's tap to enable mobile audio.
    travelVideo.play().catch(cause => {
      if (attempt !== playbackAttempt || !travelPopup.open) return;
      if (cause.name === 'NotAllowedError') {
        playVideoButton.hidden = false;
        travelCaption.textContent = 'TAP PLAY TO START THE CLIP WITH SOUND';
      } else if (cause.name !== 'AbortError') {
        travelCaption.textContent = 'CLIP UNAVAILABLE. CLOSE TO RETURN TO TIME CIRCUITS.';
      }
    });
  }
  function stopTravelAnimation() {
    playbackAttempt++;
    travelVideo.pause();
    playVideoButton.hidden = true;
  }
  playVideoButton.addEventListener('click', playTravelVideo);
  travelVideo.addEventListener('playing', () => {
    if (!travelPopup.open) return;
    playVideoButton.hidden = true;
    travelCaption.textContent = 'TIME TRAVEL IN PROGRESS';
  });
  travelVideo.addEventListener('waiting', () => {
    if (travelPopup.open) travelCaption.textContent = 'BUFFERING TIME TRAVEL CLIP…';
  });
  travelVideo.addEventListener('error', () => {
    if (travelPopup.open) travelCaption.textContent = 'CLIP UNAVAILABLE. CLOSE TO RETURN TO TIME CIRCUITS.';
  });
  travelVideo.addEventListener('ended', () => {
    if (travelPopup.open) travelPopup.close();
  });
  travelPopup.addEventListener('close', stopTravelAnimation);
  travelPopup.addEventListener('cancel', stopTravelAnimation);
  document.getElementById('skip-travel').addEventListener('click', () => {
    stopTravelAnimation();
    travelPopup.close();
  });
  window.timeCircuits = Object.freeze({
    set,
    travel,
    get: name => values[name],
    resetPresent: () => { presentDate = null; tick(); saveHunt(); }
  });
  window.timeHunt = Object.freeze({
    getState: huntState,
    setStep: changeStep,
    reset: () => {
      huntIndex = initialIndex;
      huntCompleted = false;
      presentDate = null;
      set('departed', '1985-10-26T01:20');
      set('destination', null);
      tick();
      refreshHunt();
      saveHunt();
      return huntState();
    }
  });
  function tick() {
    const current = localValue(new Date());
    const present = `${presentDate || current.slice(0,10)}T${current.slice(11)}`;
    if (values.present !== present) {
      values.present = present;
      render('present', parse(present));
    }
    if (values.destination) {
      const destination = `${values.destination.slice(0,10)}T${current.slice(11)}`;
      if (values.destination !== destination) {
        values.destination = destination;
        render('destination', parse(destination));
      }
    }
  }
  function syncEntry() {
    [[0,2,'month'],[2,4,'day'],[4,8,'year']].forEach(([start,end,name]) => {
      document.getElementById(`${name}-entry`).textContent = entry.slice(start,end).map(char => char || '_').join('');
      const active = cursor >= start && (cursor < end || (end === 8 && cursor === 8));
      document.getElementById(`${name}-slot`).classList.toggle('selected', active);
    });
    const destinationLocked = Boolean(values.destination) && !huntCompleted;
    travelButton.disabled = !destinationLocked;
    document.getElementById('engage-control').classList.toggle('ready', destinationLocked);
    document.getElementById('engage-status-text').textContent = huntCompleted ? 'HUNT COMPLETE' : destinationLocked ? 'DESTINATION LOCKED' : 'AWAITING DESTINATION';
    let validEntry = false;
    if (entry.every(Boolean)) {
      try { parse(entry.join('')); validEntry = true; } catch { /* Displayed by key(). */ }
    }
    submitDestination.disabled = !validEntry;
    readyLamp.classList.toggle('lit', validEntry);
  }
  function key(key) {
    if (key === 'clear') { entry = Array(8).fill(''); cursor = 0; error.textContent = ''; syncEntry(); return; }
    if (key === 'backspace') { cursor = Math.max(0,cursor-1); entry[cursor] = ''; }
    else if (/^\d$/.test(key) && cursor < 8) { entry[cursor++] = key; }
    else return;
    error.textContent = '';
    if (entry.every(Boolean)) {
      try { parse(entry.join('')); } catch (cause) { error.textContent = cause.message; }
    }
    syncEntry();
  }
  document.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => key(button.dataset.key)));
  document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => {
    cursor = Number(button.dataset.start);
    syncEntry();
  }));
  function openInput() {
    if (values.destination) {
      const date = parse(values.destination);
      entry = [...`${pad(date.month)}${pad(date.day)}${String(date.year).padStart(4,'0')}`];
    } else entry = Array(8).fill('');
    cursor = 0;
    error.textContent = '';
    syncEntry();
    if (!inputPopup.open) inputPopup.showModal();
  }
  document.getElementById('open-input').addEventListener('click', openInput);
  document.getElementById('open-message').addEventListener('click', () => {
    refreshHunt();
    if (!messagePopup.open) messagePopup.showModal();
  });
  document.getElementById('close-message').addEventListener('click', () => messagePopup.close());
  document.getElementById('close-failure').addEventListener('click', () => failurePopup.close());
  document.getElementById('retry-input').addEventListener('click', () => {
    failurePopup.close();
    openInput();
  });
  document.getElementById('close-input').addEventListener('click', () => inputPopup.close());
  submitDestination.addEventListener('click', () => {
    if (!entry.every(Boolean)) { error.textContent = 'Enter all eight digits (MMDDYYYY).'; return; }
    try {
      set('destination', entry.join(''));
      inputPopup.close();
    } catch (cause) { error.textContent = cause.message; }
  });
  travelButton.addEventListener('click', () => {
    try { travel(); } catch (cause) { error.textContent = cause.message; }
  });
  document.querySelector('.keypad-panel').addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^\d$/.test(event.key) || event.key === 'Backspace') {
      event.preventDefault();
      key(event.key === 'Backspace' ? 'backspace' : event.key);
    }
  });
  set('destination', null);
  set('departed', '1985-10-26T01:20');
  tick();
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey));
    // Preserve existing progress when converting the old zero-based numbering.
    const savedStep = saved && (saved.schema === 1 ? saved.step + 1 : saved.step);
    const index = saved && huntSteps.findIndex(item => item.step === savedStep);
    if (saved && (saved.schema === 1 || saved.schema === 2) && index >= 0) {
      // Validate the entire saved snapshot before restoring any part of it.
      if (saved.presentDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(saved.presentDate)) throw new Error('Invalid saved present date');
      if (saved.presentDate !== null) parse(saved.presentDate);
      parse(saved.departed);
      if (saved.destination !== null) parse(saved.destination);
      huntIndex = index;
      huntCompleted = saved.completed === true && index === huntSteps.length - 1;
      presentDate = saved.presentDate;
      set('departed', saved.departed);
      set('destination', saved.destination);
      tick();
    }
  } catch { /* Invalid or unavailable storage starts a fresh hunt. */ }
  refreshHunt();
  restoring = false;
  const query = new URLSearchParams(location.search);
  names.forEach(name => {
    if (query.has(name)) {
      try { set(name, query.get(name)); } catch (cause) { error.textContent = `${name}: ${cause.message}`; }
    }
  });
  saveHunt();
  window.addEventListener('timecircuits:update', event => {
    try {
      const updates = event.detail || {};
      // Validate the entire update before applying any fields.
      names.filter(name => name in updates).forEach(name => {
        if (name === 'destination' && (updates[name] === null || updates[name] === '')) return;
        parse(updates[name]);
      });
      names.filter(name => name in updates).forEach(name => set(name, updates[name]));
    } catch (cause) { error.textContent = cause.message; }
  });
  setInterval(tick, 1000);
})();

