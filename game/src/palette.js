// The look plan, in one place. A freight yard at dusk: warm low sun, cool
// blue shadows, rust and sand. The same names are the CSS custom properties
// in index.html. Team colours are the only additions: VANGUARD blue,
// EMBER red. Everything that draws — the map, the bots, the HUD — reads
// from this one object, so a palette change is a one-line change.

export const PALETTE = {
  canvas: '#191410', // sky and fog
  surface: '#2b2118', // ground, big walls
  hairline: '#4d3d2a', // crates, containers, cover
  ink: '#f2e8d5', // light surfaces, HUD text
  muted: '#a89880', // dim text, distant detail
  accent: '#ff8c2f', // the sun, muzzle flashes, highlights
  rust: '#8a4a28', // containers, barrels
  sand: '#c9a86a', // ground patches, site markers
  teamBlue: '#4a90d9', // VANGUARD (attackers, the player's team)
  teamRed: '#e8532f', // EMBER (defenders)
};

// A named colour, as a string the three.js materials and the CSS both take.
export function shade(name) {
  return PALETTE[name];
}
