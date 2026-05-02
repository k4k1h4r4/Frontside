const OPTIONS = [
  'FUPA sighting! (Skin)',
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

const board = document.querySelector('#bingo-board');
const markedCount = document.querySelector('#marked-count');
const savedStatus = document.querySelector('#saved-status');
const newCardButton = document.querySelector('#new-card');
const clearMarksButton = document.querySelector('#clear-marks');

let state = loadState();

function createState() {
  return {
    card: shuffle(OPTIONS).slice(0, CARD_SIZE),
    marked: Array(CARD_SIZE).fill(false),
    createdAt: new Date().toISOString()
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

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const freshState = createState();
    saveState(freshState);
    return freshState;
  }

  try {
    const parsed = JSON.parse(saved);
    const hasValidCard = Array.isArray(parsed.card) && parsed.card.length === CARD_SIZE;
    const hasValidMarks = Array.isArray(parsed.marked) && parsed.marked.length === CARD_SIZE;

    if (hasValidCard && hasValidMarks) {
      return {
        card: parsed.card,
        marked: parsed.marked.map(Boolean),
        createdAt: parsed.createdAt || new Date().toISOString()
      };
    }
  } catch (error) {
    console.warn('Saved bingo card could not be loaded.', error);
  }

  const freshState = createState();
  saveState(freshState);
  return freshState;
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  announceSaved();
}

function announceSaved() {
  const time = new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  savedStatus.textContent = `Saved ${time}`;
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
    cell.setAttribute('aria-label', `${label}${isMarked ? ', marked' : ', unmarked'}`);
    cell.dataset.index = String(index);

    text.className = 'bingo-cell-text';
    text.textContent = label;

    cell.append(text);
    board.append(cell);
  });

  updateCount();
}

function updateCount() {
  const count = state.marked.filter(Boolean).length;
  markedCount.textContent = `${count} / ${CARD_SIZE} marked`;
}

function toggleCell(index) {
  state.marked[index] = !state.marked[index];
  saveState(state);
  render();
}

board.addEventListener('click', (event) => {
  const cell = event.target.closest('.bingo-cell');

  if (!cell) {
    return;
  }

  toggleCell(Number(cell.dataset.index));
});

clearMarksButton.addEventListener('click', () => {
  state.marked = Array(CARD_SIZE).fill(false);
  saveState(state);
  render();
});

newCardButton.addEventListener('click', () => {
  state = createState();
  saveState(state);
  render();
});

render();
