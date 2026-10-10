// Palette + font tokens for the Cook lab (Canvas side). CSS mirrors these in cook.css.
// Unity port: a ScriptableObject "CookTheme" with the same names.
export const THEME = Object.freeze({
  // brand tokens
  cream: '#f1ead8',
  charcoal: '#22262a',
  teal: '#4f8f8a',
  mustard: '#d9a83a',
  rust: '#9c4a32',
  // supporting
  ink: '#16191c',
  panel: '#2b3035',
  steel: '#8e959a',
  steelDark: '#5f666c',
  steelDeep: '#454c52',
  steelLight: '#b8bcb6',
  wood: '#8c5c3c',
  woodDark: '#6a432b',
  woodLight: '#a77650',
  wall: '#cdbf9f',
  wallDark: '#b5a684',
  wallDeep: '#8f8366',
  curtain: '#9c4a32',
  curtainDark: '#7d3a28',
  glassFill: 'rgba(214, 236, 230, 0.20)',
  glassEdge: 'rgba(241, 234, 216, 0.85)',
  glassShine: 'rgba(255, 255, 255, 0.45)',
  flame: '#f0a03a',
  flameHot: '#ffe08a',
  flameBlue: '#7fb6d9',
  good: '#8fb36a',
  warn: '#d9a83a',
  bad: '#c7583e',
  sky: '#e9c79a',
  skyDusk: '#d99a6a',
  font: 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
});

export function font(weight, px) {
  return `${weight} ${Math.max(8, Math.round(px))}px ${THEME.font}`;
}
