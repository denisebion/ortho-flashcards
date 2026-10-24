// Small DOM helpers. Everything from cards.json is inserted as text (never innerHTML),
// so tips like "Kids <4" and answers like "a & b" can never be read as HTML.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// "#E4572E" -> "rgba(228, 87, 46, 0.18)"
export function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The card sentence. Front: each cloze is a blank (showing its hint if it has one).
// Back: each cloze shows its highlighted answer.
export function cardText(card, side) {
  return h('p', { class: 'card-text' }, card.parts.map((part) => {
    if (part.t === 'text') return part.v;
    return side === 'front'
      ? h('span', { class: 'blank', 'aria-label': 'blank' }, part.h || '…')
      : h('span', { class: 'answer' }, part.a);
  }));
}

// "2026-09-06" -> "Sep 6" (parsed by hand so time zones can't shift the day)
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function loggedLine(card) {
  return card.dates.length ? `Logged ${card.dates.map(shortDate).join(', ')}` : '';
}
