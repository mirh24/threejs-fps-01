// Keyboard and mouse, plus the pointer lock that turns mouse movement into
// looking around. Plain browser APIs only: the game asks the canvas for
// pointer lock and reads movementX/Y while it holds it.
//
// One-shot actions (pressed once per key press) are queued here and drained
// by main.js each frame: use (E: plant/defuse), grenade (G), cycle weapon
// (Q), weapon slots (1-5), buy menu (B), reload (R). Held state — movement
// keys, firing, aiming, look deltas — stays in `state` and is read directly.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  const pressed = [];

  function keyDown(event) {
    if (!event.repeat) {
      const once = {
        KeyE: 'use',
        KeyG: 'grenade',
        KeyQ: 'cycle',
        KeyB: 'buy',
        KeyR: 'reload',
        Digit1: 'slot1',
        Digit2: 'slot2',
        Digit3: 'slot3',
        Digit4: 'slot4',
        Digit5: 'slot5',
      }[event.code];
      if (once) pressed.push(once);
    }
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function keyUp(event) {
    keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function clearHeld() {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearHeld);
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) clearHeld();
    onLockChange(state.locked);
  });

  return {
    state,

    requestLock() {
      canvas.requestPointerLock();
    },

    // The look delta accumulated since the last call; main.js drains it once
    // per simulation step.
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },

    // The one-shot actions queued since the last call, in press order.
    takePressed() {
      if (pressed.length === 0) return [];
      const out = pressed.slice();
      pressed.length = 0;
      return out;
    },
  };
}
