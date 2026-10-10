// Inline SVG icons for the cook panel (24×24 viewBox, flat fills, no external assets).
// Each returns a string; colours come from currentColor unless an ingredient colour is passed.

const svg = (body, cls = '') => `<svg class="ck-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  vent: () => svg('<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9.5h12M6 12h12M6 14.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  curtains: () => svg('<path d="M3 4h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 5c0 6 1 10 4 14H4zM20 5c0 6-1 10-4 14h4z" fill="currentColor"/><path d="M10 6v12M14 6v12" stroke="currentColor" stroke-width="1.4" opacity=".45"/>'),
  extinguisher: () => svg('<path d="M9 3h4l2 2h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="7" width="7" height="14" rx="3" fill="currentColor"/><rect x="9" y="5" width="3" height="2.5" fill="currentColor"/><path d="M14.5 9.5c2.5.5 4 2 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  fumes: () => svg('<path d="M12 3.2 22 20H2z" fill="currentColor"/><path d="M12 9v5" stroke="#22262a" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17" r="1.4" fill="#22262a"/>'),
  fire: () => svg('<path d="M12 2.5c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.6 2.2-4.8.2 1.6.9 2.6 2 3.1-.6-3.2.3-6.2 1.3-8.8z" fill="currentColor"/><path d="M12 13.5c.6 1.5 2.3 2.2 2.3 4a2.3 2.3 0 0 1-4.6 0c0-1.3.9-2.4 2.3-4z" fill="#22262a" opacity=".35"/>'),
  thermo: () => svg('<path d="M10 4a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="16.6" r="2.2" fill="currentColor"/><path d="M12 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  bag: () => svg('<path d="M5 6h14l-1 14H6z" fill="currentColor" opacity=".9"/><path d="M5 6h14v2.2H5z" fill="#9c4a32"/><path d="M9 12l2 2 4-4" stroke="#22262a" stroke-width="1.6" fill="none" opacity=".5"/>'),
  smoke: () => svg('<circle cx="8" cy="14" r="4.5" fill="currentColor"/><circle cx="14.5" cy="11" r="5.5" fill="currentColor" opacity=".8"/><circle cx="17" cy="16" r="3.5" fill="currentColor" opacity=".65"/>'),
  oil: () => svg('<path d="M12 3c3 4.5 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 3-6.5 6-11z" fill="currentColor"/><path d="M9.3 14.5a2.8 2.8 0 0 0 2.4 2.8" stroke="#22262a" stroke-width="1.5" fill="none" opacity=".35" stroke-linecap="round"/>'),
  nitro: () => svg('<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z" fill="currentColor"/>'),
  hp: () => svg('<rect x="3" y="7" width="18" height="13" rx="3" fill="currentColor"/><path d="M9 4h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5v6M9 13.5h6" stroke="#22262a" stroke-width="2.2" stroke-linecap="round"/>'),
  megaphone: () => svg('<path d="M4 10v4h3l8 4V6L7 10z" fill="currentColor"/><path d="M18 9.5c1 .8 1.5 1.6 1.5 2.5s-.5 1.7-1.5 2.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M7.5 14.5 9 19h2.5l-1-4" fill="currentColor"/>'),
  chevron: () => svg('<path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: () => svg('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  book: () => svg('<path d="M4 4.5h6.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H4z" fill="currentColor"/><path d="M20 4.5h-5A2.5 2.5 0 0 0 12.5 7v13a2 2 0 0 1 2-2H20z" fill="currentColor" opacity=".6"/>'),
  trash: () => svg('<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>'),
  star: () => svg('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.4 6.6 19.4l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>'),
};

// ── ingredient icons (tinted with the ingredient colour) ─────────────────────
const ING = {
  salts: (c) => `<path d="M4 19 8.5 9l3 4 2.5-6L20 19z" fill="${c}"/><path d="M8.5 9l3 4-3 6H4z" fill="#000" opacity=".14"/>`,
  solvent: (c) => `<rect x="9.5" y="2.5" width="5" height="4" rx="1" fill="#8e959a"/><path d="M8 7h8l1 3v9.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10z" fill="${c}"/><rect x="8.5" y="12" width="7" height="4" fill="#f1ead8" opacity=".8"/>`,
  fuel: (c) => `<rect x="6" y="6" width="12" height="15" rx="3" fill="${c}"/><rect x="10" y="2.5" width="4" height="4" fill="#5f666c"/><path d="M6 11h12" stroke="#000" stroke-width="1.4" opacity=".2"/><path d="M12 13.5c1.3 1.6 2 2.6 2 3.6a2 2 0 0 1-4 0c0-1 .7-2 2-3.6z" fill="#f1ead8" opacity=".85"/>`,
  ice: (c) => `<path d="M4 9l7-4 9 3v8l-7 4-9-3z" fill="${c}"/><path d="M4 9l9 3 7-4M13 12v8" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/><path d="M4 9l9 3v8l-9-3z" fill="#000" opacity=".08"/>`,
  catalyst: (c) => `<path d="M5 6c0-1.7 14-1.7 14 0s-14 1.7-14 3.6 14 1.7 14 3.6-14 1.7-14 3.6 14 1.7 14 3.6" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`,
  scrap: (c) => `<path d="M3.5 8 10 4l8 2 2.5 7-4 6.5-9-1L3 13z" fill="${c}"/><circle cx="8" cy="9" r="1.2" fill="#22262a" opacity=".5"/><circle cx="16" cy="15" r="1.2" fill="#22262a" opacity=".5"/><path d="M10 4l1 8 9.5 1" stroke="#000" stroke-width="1" fill="none" opacity=".18"/>`,
  syrup: (c) => `<rect x="7.5" y="3" width="9" height="3" rx="1" fill="#9c4a32"/><path d="M6 7h12v12a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19z" fill="${c}"/><path d="M10 11.5h4v5.5h-4zM12 9.5v2M10 13.5H8.5M14 14.5h1.5" stroke="#7e9b6e" stroke-width="1.6" fill="#7e9b6e"/>`,
};
export function ingredientIcon(id, color = '#ccc') {
  const f = ING[id];
  return svg(f ? f(color) : `<circle cx="12" cy="12" r="7" fill="${color}"/>`, 'ck-ico-ing');
}

// ── step-type icons (shown on recipe cards and in the header dots) ───────────
const STEP = {
  grind: '<path d="M4 12h16l-2.2 6.5a2 2 0 0 1-1.9 1.5H8.1a2 2 0 0 1-1.9-1.5z" fill="currentColor"/><path d="M13 12 18.5 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  measure: '<path d="M6 4h12M7 4v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11h8v7a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" fill="currentColor"/>',
  heat: '<path d="M12 3c.7 2.6 4.5 4 4.5 8a4.5 4.5 0 0 1-9 0c0-1.7.8-2.8 1.8-3.8.2 1.2.7 2 1.6 2.4-.5-2.5.3-4.6 1.1-6.6z" fill="currentColor"/><path d="M4 20h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  stir: '<ellipse cx="12" cy="15" rx="8" ry="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 15 16 3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.5 15.5a5.5 2.2 0 0 0 7 1.3" stroke="currentColor" stroke-width="1.6" fill="none" opacity=".6"/>',
  cool: '<path d="M3 13h18l-2 6H5z" fill="currentColor"/><path d="M8 7l2-2 2 2-2 2zM13.5 9l1.5-1.5L16.5 9 15 10.5z" fill="currentColor" opacity=".7"/><circle cx="12" cy="13" r="0" />',
  break: '<path d="M4 17 7 7l5 3 3-5 5 12z" fill="currentColor"/><path d="M12 10l-1 7M15 5l1.2 5" stroke="#22262a" stroke-width="1.4" opacity=".55"/>',
  hammer: '<path d="M5 6.5 11 4l2.5 2.5-2 2z" fill="currentColor"/><path d="M11.5 8.5 19.5 17a1.6 1.6 0 0 1-2.3 2.3L9.3 11" fill="currentColor"/><path d="M4 20h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/>',
};
export function stepIcon(type) {
  return svg(STEP[type] || '<circle cx="12" cy="12" r="6" fill="currentColor"/>', 'ck-ico-step');
}
