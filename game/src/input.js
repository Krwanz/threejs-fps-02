// Keyboard and mouse input, including pointer lock. The game owns one Input
// object; the simulation reads its held keys and accumulated mouse deltas each
// fixed step, then clears the deltas.
export function createInput(canvas, onLockChange) {
  const keys = {};
  // Edge-triggered presses: a keydown lands in this set and stays until a
  // fixed step consumes it, so a quick tap between two frames is never lost.
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let firing = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) justPressed.add(e.code);
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    firing = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && locked) firing = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });
  document.addEventListener('pointerlockerror', () => { locked = false; });

  return {
    keys,
    get locked() { return locked; },
    get firing() { return firing; },
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // Consume the mouse movement since the last step.
    consumeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    // Edge-triggered key: true once per press, even a tap between two steps.
    pressed(codeName) {
      if (justPressed.has(codeName)) { justPressed.delete(codeName); return true; }
      return false;
    },
    // Test hook: inject a press without a real keyboard event.
    injectPress(codeName) { justPressed.add(codeName); },
  };
}
