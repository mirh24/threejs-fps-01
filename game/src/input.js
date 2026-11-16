// Keyboard, mouse and pointer lock. One object owns every key and
// the mouse deltas, so the game loop reads input from a single place
// and the menu can grab or release the pointer without surprises.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.rightDown = false;
    this.locked = false;
    this.onKey = null; // (code) => void, for menu shortcuts
    this.onMouseDown = null; // (button) => void
    this.onMouseUp = null;
    this.onLockChange = null; // (locked) => void
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      if (this.onKey) this.onKey(event.code);
      if (['Space', 'Tab'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        if (this.onMouseDown) this.onMouseDown(0);
      } else if (event.button === 2) {
        this.rightDown = true;
        if (this.onMouseDown) this.onMouseDown(2);
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.mouseDown = false;
        if (this.onMouseUp) this.onMouseUp(0);
      } else if (event.button === 2) {
        this.rightDown = false;
        if (this.onMouseUp) this.onMouseUp(2);
      }
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    try {
      this.canvas.requestPointerLock();
    } catch {
      // Pointer lock can fail in a headless run; the game still renders.
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  // Camera-space movement wish: x strafe, z forward.
  moveWish() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
}
