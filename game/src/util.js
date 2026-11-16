// Tiny shared helpers used all over the game: a deterministic RNG so the
// ?shot= captures render the same frame every time, plus the clamps, lerps
// and angle math the simulation leans on. Nothing here allocates in a hot
// loop — the RNG closes over one integer and the rest are pure arithmetic.

export function mulberry32(seed) {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

// The shortest signed turn from one yaw to another, in (-PI, PI]. Bots use it
// to turn toward a waypoint or a target without spinning the long way round.
export function angleDelta(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function formatMoney(amount) {
  return `$${Math.round(amount)}`;
}

export function formatTimer(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
