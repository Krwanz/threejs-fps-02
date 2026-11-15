// Procedural textures, painted on canvas at boot: no image files, no network.
// Each texture is small and tileable, drawn once and reused by every mesh that
// shares its material.
import * as THREE from 'three';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, n, colors, rMin, rMax, rnd) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.globalAlpha = 0.12 + rnd() * 0.25;
    const r = rMin + rnd() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Tiny deterministic RNG for the painters only, so textures never flicker.
function painterSeed(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTextures() {
  const sandRnd = painterSeed(11);
  const sand = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c9a06b';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#b98d5e', '#d9b98a', '#a9854f', '#e0c08e'], 1, 4, sandRnd);
    // faint tyre tracks
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.25)';
    ctx.lineWidth = 7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(sandRnd() * s, 0);
      ctx.bezierCurveTo(sandRnd() * s, s * 0.3, sandRnd() * s, s * 0.6, sandRnd() * s, s);
      ctx.stroke();
    }
  }, 8, 6);

  const wallRnd = painterSeed(23);
  const wall = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b98d5e';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 500, ['#a87c50', '#c79c6d', '#9c6f47'], 1, 3, wallRnd);
    // sun-bleached top band and a grime line at the base
    ctx.fillStyle = 'rgba(240, 220, 180, 0.28)';
    ctx.fillRect(0, 0, s, 18);
    ctx.fillStyle = 'rgba(90, 60, 30, 0.35)';
    ctx.fillRect(0, s - 14, s, 14);
    // plaster cracks
    ctx.strokeStyle = 'rgba(80, 55, 30, 0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      let x = wallRnd() * s;
      let y = wallRnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (wallRnd() - 0.5) * 40; y += wallRnd() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 2, 1);

  const crateRnd = painterSeed(37);
  const crate = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(0, 0, s, s);
    // planks
    for (let y = 0; y < s; y += 42) {
      ctx.fillStyle = (y / 42) % 2 ? '#83653f' : '#715630';
      ctx.fillRect(0, y, s, 40);
      ctx.fillStyle = 'rgba(40, 26, 12, 0.55)';
      ctx.fillRect(0, y + 40, s, 2);
    }
    // frame + diagonal brace
    ctx.strokeStyle = '#5f4729';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.stroke();
    speckle(ctx, s, 200, ['#5f4729', '#8a6c44'], 1, 3, crateRnd);
  });

  const metalRnd = painterSeed(51);
  const metal = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#4a4f55';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 160, ['#3a3e43', '#5a6067', '#2f3337'], 1, 2, metalRnd);
    ctx.fillStyle = 'rgba(220, 140, 60, 0.5)';
    ctx.fillRect(0, s - 6, s, 6);
  });

  return { sand, wall, crate, metal };
}
