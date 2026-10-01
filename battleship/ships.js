export function shipArt(name) {
  if(name==='Carrier')return `<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path d="M5 10H166L197 23V39L175 52H5Z" fill="var(--hull, #53615f)" stroke="#acb8aa" stroke-width="2"/><path d="M15 17H169L183 27V43H15Z" fill="#303c3b" stroke="#acb8aa"/><path d="M22 30H175" stroke="#e5dfad" stroke-width="2" stroke-dasharray="9 5"/><rect x="93" y="7" width="39" height="13" rx="2" fill="#acb8aa"/><path d="M22 20V40M33 20V40M145 20V40" stroke="#acb8aa"/></svg>`;
  const submarine=name==='Submarine';
  const hull=submarine?'M30 8H164Q195 8 198 30Q195 52 164 52H30Q2 52 2 30Q2 8 30 8Z':'M5 15L136 9L174 18L198 30L174 42L136 51L5 45Z';
  const deck=submarine
    ? '<rect x="78" y="19" width="42" height="22" rx="10" fill="#acb8aa"/><path d="M99 18V7M93 8H106M20 16V44M175 17V43" stroke="#acb8aa" stroke-width="3"/>'
    : `<rect x="${name==='Patrol Boat'?65:70}" y="18" width="${name==='Patrol Boat'?45:55}" height="24" rx="2" fill="#acb8aa"/><path d="M85 20V40M100 20V40" stroke="#303c3b" stroke-width="3"/><path d="M26 30H5M147 26H182M147 34H182" stroke="#acb8aa" stroke-width="4"/><rect x="26" y="20" width="20" height="20" rx="4" fill="#acb8aa"/><rect x="135" y="19" width="20" height="22" rx="4" fill="#acb8aa"/>`;
  return `<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path d="${hull}" fill="var(--hull, #53615f)" stroke="#acb8aa" stroke-width="2"/><path d="M20 19H140L172 30L140 41H20Z" fill="#303c3b" stroke="#acb8aa"/>${deck}</svg>`;
}


