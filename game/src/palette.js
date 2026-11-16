// DUSTLINE's dusk palette. One place holds every colour the map,
// the HUD and the tracers use, so the whole game reads as one scene:
// a warm low sun from the west against cool blue shadow fill.
export const PALETTE = {
  // Sky and light.
  skyTop: 0x2e3a5e,
  skyHorizon: 0xe08a4e,
  fog: 0x3a3348,
  sun: 0xffb066,
  sunIntensity: 2.8,
  fill: 0x5a6fa8,
  fillIntensity: 0.7,
  ambient: 0x8a7a9a,
  ambientIntensity: 0.5,
  // Ground and structures.
  ground: 0x6b5a44,
  sand: 0xa88a5e,
  asphalt: 0x4a4640,
  rustLight: 0xa8542e,
  rustMid: 0x8a4526,
  rustDark: 0x5e3220,
  containerTeal: 0x3e6b62,
  containerOchre: 0xb07a2e,
  containerSlate: 0x54606a,
  warehouseWall: 0x7a6a58,
  warehouseRoof: 0x4e4438,
  tankWhite: 0x9a938a,
  tankRust: 0x7a4a28,
  crate: 0x8a6a42,
  barrel: 0x6a3a2a,
  pole: 0x3a3a3e,
  // Bomb sites.
  siteA: 0xffc46a,
  siteB: 0x6ad2ff,
  siteGlow: 0xff9a3e,
  // Teams and markers.
  vanguard: 0x4ea3ff,
  ember: 0xff7a3e,
  tracer: 0xffd27a,
  muzzle: 0xffc46a,
  // HUD.
  hudGreen: '#7dff8a',
  hudAmber: '#ffc46a',
  hudRed: '#ff5a4e',
  hudWhite: '#f2ede4',
  hudDim: '#b8b0a4',
};

export const TEAM = {
  VANGUARD: 'vanguard',
  EMBER: 'ember',
};

export const TEAM_LABEL = {
  vanguard: 'VANGUARD',
  ember: 'EMBER',
};

export const TEAM_COLOR = {
  vanguard: PALETTE.vanguard,
  ember: PALETTE.ember,
};
