const OPTIONS = [
  'Change channel / Remote request',
  'Bartender checks an ID',
  'Kitchen runs out of the Special',
  '69 hits on Keno',
  '3-Connected Vertical on Keno',
  'Jamie carries beer in pocket',
  'Buffalo Stampede',
  'Troy wears holey sweater',
  'Stranger in bar (Bartenders confirm)',
  'Handsome Devil Free Games',
  'Drink spilled / Glass breaks',
  'Paddle Ordered',
  'Keno Alarm',
  'King Kong hits 5 planes in Bonus',
  '4-Connected Horizontal on Keno',
  'Shots Ordered (3-7)',
  '$100+ Big Win on skill game',
  '2x2 box on Keno',
  'Monster Turn',
  "Player 'Luck Taps' a skill game",
  "Cowboy tells everyone he's leaving",
  'Skill game chair up',
  'Offshore Angler Fishing Bonus',
  'Jamie has towel after shift',
  'Amanda says, "I do what I want"'
];

const STORAGE_KEY = 'frontside-bingo-card-v1';
const CARD_SIZE = 16;
const OPTION_SET = new Set(OPTIONS);

const board = document.querySelector('#bingo-board');
const markedCount = document.querySelector('#marked-count');
const savedStatus = document.querySelector('#saved-status');
const newCardButton = document.querySelector('#new-card');
const clearMarksButton = document.querySelector('#clear-marks');

// Flipped to false the first time localStorage refuses to work. Some phones block
// site data outright, in which case even reading it throws — the card still plays,
// it just will not survive a reload.
let storageWorks = true;

if (OPTIONS.length < CARD_SIZE) {
  console.warn(`OPTIONS has ${OPTIONS.length} entries but a card needs ${CARD_SIZE}.`);
}

let state = loadState();

function createState() {
  return {
    card: shuffle(OPTIONS).slice(0, CARD_SIZE),
    marked: Array(CARD_SIZE).fill(false)
  };
}

function shuffle(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

// A saved card is only usable if every square is still a real, unique entry in
// OPTIONS. Without this check, edits to the list never reach anyone holding an
// older card — they keep playing retired squares until storage is cleared.
function cardMatchesCurrentOptions(card) {
  const seen = new Set();

  return card.every((label) => {
    if (typeof label !== 'string' || !OPTION_SET.has(label) || seen.has(label)) {
      return false;
    }

    seen.add(label);
    return true;
  });
}

function readStoredCard() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    storageWorks = false;
    console.warn('Saved bingo card could not be read.', error);
    return null;
  }
}

function loadState() {
  const saved = readStoredCard();

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const hasValidCard = Array.isArray(parsed.card) && parsed.card.length === CARD_SIZE;
      const hasValidMarks = Array.isArray(parsed.marked) && parsed.marked.length === CARD_SIZE;

      if (hasValidCard && hasValidMarks && cardMatchesCurrentOptions(parsed.card)) {
        return {
          card: parsed.card,
          marked: parsed.marked.map(Boolean)
        };
      }
    } catch (error) {
      console.warn('Saved bingo card could not be loaded.', error);
    }
  }

  const freshState = createState();
  saveState(freshState, { announce: false });
  return freshState;
}

function saveState(nextState, { announce = true } = {}) {
  let persisted = false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    persisted = true;
  } catch (error) {
    storageWorks = false;
    console.warn('Bingo card could not be saved.', error);
  }

  if (announce) {
    announceSaved(persisted);
  }
}

function announceSaved(persisted) {
  if (!persisted) {
    setSavedStatus('Not saved — this browser is blocking storage');
    return;
  }

  const time = new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  setSavedStatus(`Saved ${time}`);
}

// #saved-status is aria-live, so only touch it when the text actually changes —
// otherwise every tap re-announces the same string to a screen reader.
function setSavedStatus(message) {
  if (!savedStatus || savedStatus.textContent === message) {
    return;
  }

  savedStatus.textContent = message;
}

function render() {
  board.replaceChildren();

  state.card.forEach((label, index) => {
    const cell = document.createElement('button');
    const text = document.createElement('span');
    const isMarked = state.marked[index];

    cell.className = `bingo-cell${isMarked ? ' is-marked' : ''}`;
    cell.type = 'button';
    cell.setAttribute('aria-pressed', String(isMarked));
    cell.dataset.index = String(index);

    text.className = 'bingo-cell-text';
    text.textContent = label;

    cell.append(text);
    board.append(cell);
  });

  updateCount();
}

function updateCount() {
  if (!markedCount) {
    return;
  }

  const count = state.marked.filter(Boolean).length;
  markedCount.textContent = `${count} / ${CARD_SIZE} marked`;
}

// Updates the one cell in place rather than rebuilding the board. A full re-render
// destroys the button the player just activated, which throws keyboard focus back
// to the top of the page on every single mark.
function toggleCell(index) {
  const cell = board.children[index];

  if (!cell) {
    return;
  }

  state.marked[index] = !state.marked[index];
  saveState(state);

  cell.classList.toggle('is-marked', state.marked[index]);
  cell.setAttribute('aria-pressed', String(state.marked[index]));
  updateCount();
}

board.addEventListener('click', (event) => {
  const cell = event.target.closest('.bingo-cell');

  if (!cell) {
    return;
  }

  const index = Number(cell.dataset.index);

  if (!Number.isInteger(index) || index < 0 || index >= CARD_SIZE) {
    return;
  }

  toggleCell(index);
});

clearMarksButton.addEventListener('click', () => {
  state.marked = Array(CARD_SIZE).fill(false);
  saveState(state);
  render();
});

newCardButton.addEventListener('click', () => {
  const hasMarks = state.marked.some(Boolean);

  if (hasMarks && !confirm('Start a new card? Your current card and marks will be lost.')) {
    return;
  }

  state = createState();
  saveState(state);
  render();
});

render();

if (!storageWorks) {
  announceSaved(false);
}
