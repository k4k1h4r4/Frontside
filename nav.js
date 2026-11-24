(() => {
  'use strict';

  const script = document.currentScript;
  if (!script) return;
  const base = new URL('.', script.src);

  const nav = document.querySelector('[data-site-nav]');
  if (!nav) return;

  /* ---- The only part you edit to change the site nav ----
     A link has a path; a menu has items. `pages` lists every page
     that should highlight that entry. */
  const HOME = 'index.html';
  const LINKS = [
    { label: 'Live', path: 'live-feed.html', pages: ['live-feed.html'] },
    { label: 'Keno', path: 'keno.html',      pages: ['keno.html', 'ticket.html'] },
    { label: 'Games', items: [
      { label: 'Battleship Keno',       path: 'battleship.html',    pages: ['battleship.html', 'battleship-results.html'] },
      { label: 'Arcade',                path: 'Arcade/arcade.html', pages: ['Arcade/arcade.html', 'Arcade/beerPong.html', 'Arcade/perfectPour.html', 'Arcade/coasterStacking.html'] },
      { label: 'Bingo',                 path: 'bingo.html',         pages: ['bingo.html', 'keno-bingo.html'] },
      { label: 'Back to the Frontside', path: 'timetravel.html',    pages: ['timetravel.html'] }
    ] }
  ];
  /* ------------------------------------------------------ */

  // Current path, normalised: lower-cased, decoded, and with a bare
  // directory (".../" or "/") treated as its index.html.
  let here = decodeURIComponent(location.pathname).toLowerCase();
  if (here.endsWith('/')) here += 'index.html';

  const resolve = (p) => decodeURIComponent(new URL(p, base).pathname).toLowerCase();
  const isHere = (p) => resolve(p) === here;

  function link(item) {
    const a = document.createElement('a');
    a.href = new URL(item.path, base).href;
    a.textContent = item.label;
    if (item.pages.some(isHere)) {
      a.classList.add('active');
      a.setAttribute('aria-current', isHere(item.path) ? 'page' : 'true');
    }
    return a;
  }

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
  const menus = [];

  LINKS.forEach((item, i) => {
    const li = document.createElement('li');
    if (!item.items) {
      li.append(link(item));
      list.append(li);
      return;
    }

    // Disclosure menu: a button that shows/hides a list of links.
    li.className = 'nav-menu';
    const id = `site-nav-menu-${i}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-menu-toggle';
    toggle.textContent = item.label;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id);
    const caret = document.createElement('span');
    caret.className = 'nav-caret';
    caret.setAttribute('aria-hidden', 'true');
    toggle.append(caret);

    const sub = document.createElement('ul');
    sub.className = 'nav-submenu';
    sub.id = id;
    sub.hidden = true;
    for (const child of item.items) {
      const subLi = document.createElement('li');
      subLi.append(link(child));
      sub.append(subLi);
    }
    if (item.items.some((child) => child.pages.some(isHere))) toggle.classList.add('active');

    const setOpen = (open) => {
      sub.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      li.classList.toggle('open', open);
    };
    toggle.addEventListener('click', () => setOpen(sub.hidden));
    menus.push({ li, toggle, setOpen });

    li.append(toggle, sub);
    list.append(li);
  });

  frag.append(list);

  // Close on a tap/click elsewhere, Escape, focus leaving the menu,
  // or returning to this page from the back/forward cache.
  const closeAll = (except) => menus.forEach((m) => { if (m.li !== except) m.setOpen(false); });
  document.addEventListener('pointerdown', (event) => {
    closeAll(menus.find((m) => m.li.contains(event.target))?.li);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = menus.find((m) => m.toggle.getAttribute('aria-expanded') === 'true');
    if (!open) return;
    open.setOpen(false);
    open.toggle.focus();
  });
  for (const m of menus) {
    // Keyboard Tab away closes it. A null relatedTarget is a mouse/touch
    // press (Safari doesn't focus links on click); pointerdown handles that.
    m.li.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !m.li.contains(event.relatedTarget)) m.setOpen(false);
    });
  }
  window.addEventListener('pageshow', () => closeAll());

  // Make it a real landmark even if the host element isn't a <nav>.
  if (nav.tagName !== 'NAV') nav.setAttribute('role', 'navigation');
  if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Main');

  nav.replaceChildren(frag);
})();
