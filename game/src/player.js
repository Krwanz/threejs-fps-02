// The player: first-person movement with acceleration and friction, crouch,
// jumping, AABB collision, health and armour. The camera rides on the player;
// weapons.js owns the viewmodel and the shooting.
import * as THREE from 'three';
import { CONFIG } from './state.js';
import { clamp, moveCircle } from './util.js';

export function createPlayer(world, S) {
  const player = {
    x: 0, z: 19, y: 0, vy: 0, yaw: 0, pitch: 0,
    vx: 0, vz: 0,
    hp: 100, armor: 0, alive: true,
    crouched: false, moving: false, speed: 0,
    money: 800,
    weapons: { pistol: { mag: 12, reserve: 36 } },
    grenades: 0,
    current: 'pistol',
    recoilPitch: 0, recoilYaw: 0,
    stepTimer: 0,
    spawnIndex: 0,
  };

  function spawnAt(spawn) {
    player.x = spawn.x;
    player.z = spawn.z;
    player.y = 0;
    player.vy = 0;
    player.vx = 0;
    player.vz = 0;
    player.yaw = spawn.z > 0 ? 0 : Math.PI; // south spawn faces north, north spawn faces south
    player.pitch = 0;
    player.hp = 100;
    player.alive = true;
    player.recoilPitch = 0;
    player.recoilYaw = 0;
  }

  function eyeHeight() {
    return player.crouched ? CONFIG.eyeCrouch : CONFIG.eyeStand;
  }

  // Fixed-step movement. Returns nothing; reads input, writes position.
  function update(dt, input, audio) {
    if (!player.alive) return;
    const k = input.keys;
    player.crouched = !!(k.ControlLeft || k.KeyC);

    // Wish direction in world space from yaw.
    let fx = -Math.sin(player.yaw);
    let fz = -Math.cos(player.yaw);
    let rx = Math.cos(player.yaw);
    let rz = -Math.sin(player.yaw);
    let wx = 0;
    let wz = 0;
    if (k.KeyW) { wx += fx; wz += fz; }
    if (k.KeyS) { wx -= fx; wz -= fz; }
    if (k.KeyD) { wx += rx; wz += rz; }
    if (k.KeyA) { wx -= rx; wz -= rz; }
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    const targetSpeed = player.crouched ? CONFIG.crouchSpeed : CONFIG.walkSpeed;
    const accel = len > 0 ? CONFIG.accel : CONFIG.friction;
    player.vx += (wx * targetSpeed - player.vx) * Math.min(1, accel * dt / targetSpeed * 4.6);
    player.vz += (wz * targetSpeed - player.vz) * Math.min(1, accel * dt / targetSpeed * 4.6);
    // Friction when no input: decay toward zero.
    if (len === 0) {
      const f = Math.max(0, 1 - CONFIG.friction * dt);
      player.vx *= f;
      player.vz *= f;
    }
    player.speed = Math.hypot(player.vx, player.vz);
    player.moving = player.speed > 0.6;

    moveCircle(player, player.vx * dt, player.vz * dt, 0.4, world.colliders);
    // Keep inside the yard even if a collider is missed.
    player.x = clamp(player.x, -31.4, 31.4);
    player.z = clamp(player.z, -21.4, 21.4);

    // Jump: grounded on y = 0.
    if (k.Space && player.y === 0 && !player.crouched) player.vy = 6.4;
    player.vy -= CONFIG.gravity * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; }

    // Footsteps, timed by distance travelled.
    if (player.moving && player.y === 0) {
      player.stepTimer -= player.speed * dt;
      if (player.stepTimer <= 0) {
        player.stepTimer = 2.4;
        if (audio) audio.footstep();
      }
    }

    // Recoil recovery: the view settles back toward where it was aimed.
    player.recoilPitch *= Math.max(0, 1 - 9 * dt);
    player.recoilYaw *= Math.max(0, 1 - 9 * dt);
  }

  function applyCamera(camera) {
    camera.position.set(player.x, player.y + eyeHeight(), player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw + player.recoilYaw;
    camera.rotation.x = player.pitch + player.recoilPitch;
    camera.rotation.z = 0;
  }

  function takeDamage(amount, fromName) {
    if (!player.alive) return false;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.5);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.hp -= rest;
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      S.events.push({ type: 'playerDown', by: fromName });
    }
    return !player.alive;
  }

  function healFull() {
    player.hp = 100;
    player.alive = true;
  }

  // Methods the rest of the game calls on the player object itself.
  player.takeDamage = (amount, fromName) => takeDamage(amount, fromName);
  player.healFull = healFull;

  return { player, spawnAt, update, applyCamera, takeDamage, healFull, eyeHeight };
}
