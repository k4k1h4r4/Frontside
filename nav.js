(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const nav = document.querySelector('[data-site-nav]');
  if (!nav) return;

  const page = location.pathname.slice(base.pathname.length);
  const links = [
    { label: 'Keno', path: 'keno.html', pages: ['keno.html', 'ticket.html', 'ticket-test.html'] },
    { label: 'Arcade', path: 'Arcade/arcade.html', pages: ['Arcade/arcade.html'] },
    { label: 'Bingo', path: 'bingo.html', pages: ['bingo.html', 'keno-bingo.html'] }
  ];
  const logo = document.createElement('a');
  logo.href = new URL('index.html', base).href;
  logo.className = 'nav-logo';
  logo.textContent = 'FRONTSIDE';
  logo.setAttribute('aria-label', 'Frontside home');
  const list = document.createElement('ul');
  list.className = 'nav-links';
  for (const item of links) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = new URL(item.path, base).href;
    a.textContent = item.label;
    if (item.pages.includes(page)) {
      a.className = 'active';
      a.setAttribute('aria-current', page === item.path ? 'page' : 'true');
    }
    li.append(a);
    list.append(li);
  }
  nav.replaceChildren(logo, list);
})();
