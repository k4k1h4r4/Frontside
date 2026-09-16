(() => {
  'use strict';

  const script = document.currentScript;
  if (!script) return;
  const base = new URL('.', script.src);

  const nav = document.querySelector('[data-site-nav]');
  if (!nav) return;

  /* ---- The only part you edit to change the site nav ---- */
  const HOME = 'index.html';
  const LINKS = [
    { label: 'Keno',   path: 'keno.html',          pages: ['keno.html', 'ticket.html', 'ticket-test.html'] },
    { label: 'Arcade', path: 'Arcade/arcade.html', pages: ['Arcade/arcade.html'] },
    { label: 'Bingo',  path: 'bingo.html',         pages: ['bingo.html', 'keno-bingo.html'] }
  ];
  /* ------------------------------------------------------ */

  // Current path, normalised: lower-cased, decoded, and with a bare
  // directory (".../" or "/") treated as its index.html.
  let here = decodeURIComponent(location.pathname).toLowerCase();
  if (here.endsWith('/')) here += 'index.html';

  const resolve = (p) => decodeURIComponent(new URL(p, base).pathname).toLowerCase();
  const isHere = (p) => resolve(p) === here;

  const frag = document.createDocumentFragment();

  const logo = document.createElement('a');
  logo.href = new URL(HOME, base).href;
  logo.className = 'nav-logo';
  logo.textContent = 'Frontside';
  logo.setAttribute('aria-label', 'Frontside home');
  if (isHere(HOME)) logo.setAttribute('aria-current', 'page');
  frag.append(logo);

  const list = document.createElement('ul');
  list.className = 'nav-links';

  for (const item of LINKS) {
    const a = document.createElement('a');
    a.href = new URL(item.path, base).href;
    a.textContent = item.label;

    if (item.pages.some(isHere)) {
      a.classList.add('active');
      a.setAttribute('aria-current', isHere(item.path) ? 'page' : 'true');
    }

    const li = document.createElement('li');
    li.append(a);
    list.append(li);
  }

  frag.append(list);

  // Make it a real landmark even if the host element isn't a <nav>.
  if (nav.tagName !== 'NAV') nav.setAttribute('role', 'navigation');
  if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Main');

  nav.replaceChildren(frag);
})();
