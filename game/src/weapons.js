// Weapons: firing, recoil and spread, reloading, grenades, the viewmodel and
// tracers. Hits are raycast against S.hitMeshes; bot body parts carry
// userData { bot, part } so a headshot pays more. Spread grows per shot and
// while moving, and shrinks when still or crouched — stopping to aim pays.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { clamp } from './util.js';

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

export function createWeapons(scene, camera, S, audio, onBotHit) {
  const raycaster = new THREE.Raycaster();
  const gun = new THREE.Group();
  camera.add(gun);
  gun.position.set(0.28, -0.26, -0.5);

  // Pooled tracers: thin additive lines from muzzle to impact, faded in the loop.
  const tracerPool = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // Pooled impact puffs.
  const impactPool = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }),
    );
    scene.add(m);
    impactPool.push({ mesh: m, life: 0 });
  }
  let impactIdx = 0;

  // Explosion flash + light, reused for every grenade.
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 }),
  );
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff9030, 0, 18);
  scene.add(blastLight);

  const wstate = {
    lastShot: -9,
    bloom: 0,
    reloading: false,
    reloadEnd: 0,
    prevFiring: false,
    kick: 0,
    grenadeCooldown: 0,
  };

  function buildViewmodel(kind) {
    while (gun.children.length) gun.remove(gun.children[0]);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x4a3421, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, kind === 'rifle' ? 0.62 : 0.34), dark);
    body.position.set(0, 0, -0.1);
    gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, kind === 'rifle' ? 0.3 : 0.16, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, kind === 'rifle' ? -0.5 : -0.32);
    gun.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), grip);
    mag.position.set(0, -0.13, 0.02);
    mag.rotation.x = 0.25;
    gun.add(mag);
    if (kind === 'rifle') {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), dark);
      sight.position.set(0, 0.09, -0.05);
      gun.add(sight);
    }
  }
  buildViewmodel('pistol');

  function switchTo(kind) {
    const p = S.player;
    if (!p.weapons[kind] || p.current === kind) return;
    p.current = kind;
    wstate.reloading = false;
    buildViewmodel(kind);
  }

  function currentDef() { return WEAPONS[S.player.current]; }

  function spreadNow() {
    const p = S.player;
    const def = currentDef();
    let s = def.spread + wstate.bloom;
    s += (p.speed / 4.6) * def.moveSpread;
    if (p.crouched) s = Math.max(0.004, s - def.crouchSpread);
    return s;
  }

  function fire(now) {
    const p = S.player;
    const def = currentDef();
    const ammo = p.weapons[p.current];
    if (wstate.reloading || now - wstate.lastShot < def.rate) return;
    if (ammo.mag <= 0) {
      audio.dryFire();
      wstate.lastShot = now;
      startReload(now);
      return;
    }
    wstate.lastShot = now;
    ammo.mag -= 1;
    wstate.bloom = Math.min(0.05, wstate.bloom + def.bloom);
    p.recoilPitch += def.recoil * (0.7 + Math.random() * 0.6);
    p.recoilYaw += (Math.random() - 0.5) * def.recoil * 0.5;
    wstate.kick = 1;
    audio.shot(p.current);

    // Direction: camera forward with a random cone of the current spread.
    camera.getWorldDirection(_dir);
    const s = spreadNow();
    _dir.x += (Math.random() - 0.5) * 2 * s;
    _dir.y += (Math.random() - 0.5) * 2 * s;
    _dir.z += (Math.random() - 0.5) * 2 * s;
    _dir.normalize();
    camera.getWorldPosition(_origin);
    raycaster.set(_origin, _dir);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(S.hitMeshes, true);
    let end = null;
    if (hits.length) {
      const h = hits[0];
      end = h.point;
      const ud = h.object.userData;
      if (ud.bot) {
        const dmg = Math.round(def.damage * (ud.part === 'head' ? def.headMult : 1));
        const killed = onBotHit(ud.bot, dmg, ud.part);
        S.events.push({ type: killed ? 'kill' : 'hit', bot: ud.bot });
        if (killed) audio.kill(); else audio.hit();
      } else {
        spawnImpact(h.point);
      }
    }
    if (!end) end = _origin.clone().add(_dir.clone().multiplyScalar(def.range));
    spawnTracer(end);
  }

  function spawnTracer(end) {
    const t = tracerPool[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracerPool.length;
    gun.getWorldPosition(_muzzle);
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, _muzzle.x, _muzzle.y, _muzzle.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  function spawnImpact(point) {
    const im = impactPool[impactIdx];
    impactIdx = (impactIdx + 1) % impactPool.length;
    im.mesh.position.copy(point);
    im.mesh.material.opacity = 0.9;
    im.life = 0.25;
  }

  function startReload(now) {
    const p = S.player;
    const def = currentDef();
    const ammo = p.weapons[p.current];
    if (wstate.reloading || ammo.mag >= def.mag || ammo.reserve <= 0) return;
    wstate.reloading = true;
    wstate.reloadEnd = now + def.reloadTime;
    audio.reload();
  }

  function finishReload() {
    const p = S.player;
    const def = currentDef();
    const ammo = p.weapons[p.current];
    const need = def.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    wstate.reloading = false;
  }

  function throwGrenade(now) {
    const p = S.player;
    if (p.grenades <= 0 || now < wstate.grenadeCooldown) return;
    p.grenades -= 1;
    wstate.grenadeCooldown = now + 0.8;
    camera.getWorldDirection(_dir);
    camera.getWorldPosition(_origin);
    S.grenades.push({
      x: _origin.x, y: _origin.y, z: _origin.z,
      vx: _dir.x * 15, vy: _dir.y * 15 + 3.5, vz: _dir.z * 15,
      fuse: 1.6, mesh: makeGrenadeMesh(),
    });
    audio.shot('pistol');
  }

  function makeGrenadeMesh() {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f4a2f, roughness: 0.6, metalness: 0.4 }),
    );
    scene.add(m);
    return m;
  }

  function explode(g) {
    scene.remove(g.mesh);
    blast.position.set(g.x, Math.max(0.6, g.y), g.z);
    blast.scale.setScalar(1);
    blast.material.opacity = 0.85;
    blastLight.position.copy(blast.position);
    blastLight.intensity = 60;
    S.events.push({ type: 'explosion', x: g.x, y: g.y, z: g.z });
    audio.explosion();
    // Radius damage with falloff, against bots and the player.
    const R = 7;
    for (const bot of S.bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.x - g.x, bot.z - g.z);
      if (d < R) {
        const dmg = Math.round(120 * (1 - d / R) + 10);
        const killed = onBotHit(bot, dmg, 'body');
        S.events.push({ type: killed ? 'kill' : 'hit', bot });
      }
    }
    const p = S.player;
    if (p.alive) {
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < R) {
        const dmg = Math.round(110 * (1 - d / R) + 10);
        p.takeDamage(dmg, 'grenade');
      }
    }
  }

  function update(dt, now, input, playerApi) {
    const p = S.player;
    // Weapon switching.
    if (input.pressed('Digit1')) switchTo('pistol');
    if (input.pressed('Digit2')) switchTo('rifle');
    if (input.pressed('Digit3') || input.pressed('KeyG')) throwGrenade(now);
    if (input.pressed('KeyR')) startReload(now);

    const def = currentDef();
    const trigger = input.firing;
    if (p.alive && S.mode === 'playing') {
      if (def.auto) {
        if (trigger) fire(now);
      } else if (trigger && !wstate.prevFiring) {
        fire(now);
      }
    }
    wstate.prevFiring = trigger;

    if (wstate.reloading && now >= wstate.reloadEnd) finishReload();
    wstate.bloom = Math.max(0, wstate.bloom - dt * 0.06);
    wstate.kick = Math.max(0, wstate.kick - dt * 8);

    // Viewmodel bob and kick.
    const bob = p.moving ? Math.sin(S.time * 9) * 0.012 * (p.speed / 4.6) : 0;
    gun.position.set(0.28, -0.26 + bob, -0.5 + wstate.kick * 0.09);
    gun.rotation.x = wstate.kick * 0.12 + (wstate.reloading ? Math.sin((wstate.reloadEnd - now) * 4) * 0.3 : 0);

    // Grenades: gravity, ground bounce, fuse.
    for (let i = S.grenades.length - 1; i >= 0; i--) {
      const g = S.grenades[i];
      g.vy -= 18 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      if (g.y < 0.09) { g.y = 0.09; g.vy = -g.vy * 0.35; g.vx *= 0.7; g.vz *= 0.7; }
      g.x = clamp(g.x, -31.5, 31.5);
      g.z = clamp(g.z, -21.5, 21.5);
      g.mesh.position.set(g.x, g.y, g.z);
      g.fuse -= dt;
      if (g.fuse <= 0) {
        S.grenades.splice(i, 1);
        explode(g);
      }
    }

    // Fade tracers, impacts and the blast flash.
    for (const t of tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      }
    }
    for (const im of impactPool) {
      if (im.life > 0) {
        im.life -= dt;
        im.mesh.material.opacity = Math.max(0, im.life / 0.25) * 0.9;
        im.mesh.scale.setScalar(1 + (0.25 - im.life) * 4);
      }
    }
    if (blast.material.opacity > 0) {
      blast.material.opacity = Math.max(0, blast.material.opacity - dt * 2.4);
      blast.scale.addScalar(dt * 9);
      blastLight.intensity = Math.max(0, blastLight.intensity - dt * 180);
    }
  }

  return {
    update, switchTo, startReload, currentDef, spreadNow,
    debugFire: () => fire(S.time),
    get reloading() { return wstate.reloading; },
  };
}
