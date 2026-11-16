// Small shared helpers: clamping, interpolation, a seeded random
// generator (so staged screenshots and bot behaviour are repeatable),
// and the few vector helpers the simulation needs. No allocations in
// the hot path: callers reuse the scratch values they pass in.
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// mulberry32: a tiny deterministic PRNG. The seed comes from the URL
// (?seed=) so a staged screenshot renders the same scene every time.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomIn(rng, min, max) {
  return min + rng() * (max - min);
}

export function randomPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// Shortest signed turn from angle `from` toward angle `to`.
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDelta(from, to) * clamp(t, 0, 1);
}

// Squared distance on the ground plane; the sim rarely needs a sqrt.
export function dist2DSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function formatMoney(amount) {
  return `$${Math.round(amount)}`;
}
