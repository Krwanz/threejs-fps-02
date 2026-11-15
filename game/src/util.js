// Shared helpers for Dustline Yard: math, seeded randomness, AABB collision and
// line-of-sight. No allocations in the hot paths: the scratch objects below are reused.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Deterministic RNG so screenshot setups and bot behaviour are reproducible.
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A collider is { minX, maxX, minZ, maxZ, top } — a box standing on the ground.
// Circle-vs-AABB resolve on one axis: returns the corrected coordinate.
export function resolveAxis(pos, radius, axis, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (axis === 'x') {
      if (pos.z + radius <= c.minZ || pos.z - radius >= c.maxZ) continue;
      if (pos.x + radius > c.minX && pos.x - radius < c.maxX) {
        const pushLeft = c.minX - radius - pos.x;
        const pushRight = c.maxX + radius - pos.x;
        pos.x += Math.abs(pushLeft) < Math.abs(pushRight) ? pushLeft : pushRight;
      }
    } else {
      if (pos.x + radius <= c.minX || pos.x - radius >= c.maxX) continue;
      if (pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
        const pushUp = c.minZ - radius - pos.z;
        const pushDown = c.maxZ + radius - pos.z;
        pos.z += Math.abs(pushUp) < Math.abs(pushDown) ? pushUp : pushDown;
      }
    }
  }
  return pos;
}

// Move a circle through the collider set, axis by axis, so it slides along walls.
export function moveCircle(pos, dx, dz, radius, colliders) {
  pos.x += dx;
  resolveAxis(pos, radius, 'x', colliders);
  pos.z += dz;
  resolveAxis(pos, radius, 'z', colliders);
  return pos;
}

// 2D segment vs AABB test (XZ plane). Returns true when the segment hits a box
// taller than eyeHeight — used for line-of-sight between two actors.
export function segmentBlocked(ax, az, bx, bz, eyeHeight, colliders) {
  const dx = bx - ax;
  const dz = bz - az;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top < eyeHeight) continue; // low crates do not block sight
    let tmin = 0;
    let tmax = 1;
    if (dx === 0) {
      if (ax < c.minX || ax > c.maxX) continue;
    } else {
      let t1 = (c.minX - ax) / dx;
      let t2 = (c.maxX - ax) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (dz === 0) {
      if (az < c.minZ || az > c.maxZ) continue;
    } else {
      let t1 = (c.minZ - az) / dz;
      let t2 = (c.maxZ - az) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}

// Shortest angular difference, wrapped to [-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
