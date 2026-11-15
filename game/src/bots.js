// Bots: the other seven fighters. Each bot is a small articulated mesh (body,
// head, gun) with a state machine — patrol waypoints, engage what it can see,
// take cover when hurt, carry and plant the bomb on attack rounds, defuse on
// defence. Shooting is hitscan with accuracy that falls off with distance,
// target movement and the bot's own movement, so a still, crouched player is
// harder to hit than a sprinting one.
import * as THREE from 'three';
import { TEAMS, CONFIG } from './state.js';
import { clamp, moveCircle, segmentBlocked, angleDiff } from './util.js';

const FRIENDLY_NAMES = ['Dune', 'Mira', 'Sable'];
const ENEMY_NAMES = ['Rook', 'Vex', 'Hawk', 'Fang'];

export function createBots(scene, world, S, audio) {
  const botGroups = [];

  function makeMesh(team) {
    const g = new THREE.Group();
    const teamCol = TEAMS[team].color;
    const bodyMat = new THREE.MeshStandardMaterial({ color: teamCol, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), darkMat);
    vest.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
    head.position.y = 1.68;
    head.castShadow = true;
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), darkMat);
    helm.position.y = 1.86;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), darkMat);
    legL.position.set(-0.14, 0.3, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), darkMat);
    gun.position.set(0.2, 1.25, 0.3);
    g.add(body, vest, head, helm, legL, legR, gun);
    return { group: g, body, head };
  }

  function spawnBots() {
    for (const g of botGroups) scene.remove(g);
    botGroups.length = 0;
    S.bots = [];
    S.hitMeshes = S.hitMeshes.filter((m) => !m.userData.bot);
    const playerSide = S.playerSide;
    const enemySide = playerSide === 'vipers' ? 'jackals' : 'vipers';
    const rnd = S.rng || Math.random;
    // Attackers always spawn south, defenders north, whichever team that is.
    const attackSpawns = world.spawns.vipers;
    const defenseSpawns = world.spawns.jackals;
    const friendSpawns = playerSide === S.attackSide ? attackSpawns : defenseSpawns;
    const enemySpawns = enemySide === S.attackSide ? attackSpawns : defenseSpawns;

    function addBot(team, name, spawn, isCarrier) {
      const { group, body, head } = makeMesh(team);
      group.position.set(spawn.x, 0, spawn.z);
      scene.add(group);
      botGroups.push(group);
      const bot = {
        id: name, name, team, x: spawn.x, z: spawn.z, yaw: spawn.z > 0 ? 0 : Math.PI,
        hp: 100, alive: true, state: 'patrol', hasBomb: !!isCarrier,
        waypoint: null, target: null, targetIsPlayer: false,
        thinkTimer: rnd() * 0.3, shootTimer: 0, burstLeft: 0,
        strafeDir: 1, strafeTimer: 0, plantProgress: 0, defuseProgress: 0,
        group, body, head, walkPhase: rnd() * 6,
      };
      body.userData = { bot, part: 'body' };
      head.userData = { bot, part: 'head' };
      S.bots.push(bot);
      S.hitMeshes.push(body, head);
      return bot;
    }

    for (let i = 0; i < 3; i++) addBot(playerSide, FRIENDLY_NAMES[i], friendSpawns[(i + 1) % friendSpawns.length], false);
    const carrierIdx = Math.floor(rnd() * 4);
    for (let i = 0; i < 4; i++) {
      addBot(enemySide, ENEMY_NAMES[i], enemySpawns[i % enemySpawns.length], enemySide === S.attackSide && i === carrierIdx);
    }
    return S.bots;
  }

  function nearestWaypoint(bot, rnd) {
    const cands = world.waypoints.filter((w) => {
      const d = Math.hypot(w.x - bot.x, w.z - bot.z);
      return d > 3 && d < 26 && !segmentBlocked(bot.x, bot.z, w.x, w.z, 1.4, world.colliders);
    });
    if (!cands.length) return world.waypoints[Math.floor(rnd() * world.waypoints.length)];
    return cands[Math.floor(rnd() * cands.length)];
  }

  // Can this bot see that point? Distance, field of view and walls.
  function canSee(bot, x, z, maxDist) {
    const dx = x - bot.x;
    const dz = z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    const ang = Math.atan2(-dx, -dz);
    if (Math.abs(angleDiff(bot.yaw, ang)) > 1.15 && d > 4) return false;
    return !segmentBlocked(bot.x, bot.z, x, z, 1.4, world.colliders);
  }

  function pickTarget(bot) {
    const rnd = S.rng || Math.random;
    const enemies = [];
    const p = S.player;
    if (p.alive && p.team !== bot.team) enemies.push({ x: p.x, z: p.z, isPlayer: true, ref: p });
    for (const b of S.bots) {
      if (b.alive && b.team !== bot.team) enemies.push({ x: b.x, z: b.z, isPlayer: false, ref: b });
    }
    // Nearest visible enemy wins.
    let best = null;
    let bestD = 1e9;
    for (const e of enemies) {
      const d = Math.hypot(e.x - bot.x, e.z - bot.z);
      if (d < bestD && canSee(bot, e.x, e.z, 48)) { best = e; bestD = d; }
    }
    return best;
  }

  function shootAt(bot, target, dt) {
    bot.shootTimer -= dt;
    if (bot.shootTimer > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.shootTimer = 0.5 + Math.random() * 0.7;
      return;
    }
    bot.burstLeft -= 1;
    bot.shootTimer = 0.13;
    const d = Math.hypot(target.x - bot.x, target.z - bot.z);
    const targetSpeed = target.isPlayer ? S.player.speed : 2.5;
    let chance = 0.45 - d * 0.008 - targetSpeed * 0.05;
    if (target.isPlayer && S.player.crouched) chance -= 0.1;
    if (bot.state === 'engage' && Math.abs(bot.strafeDir) > 0) chance -= 0.05;
    if (Math.random() > chance) return;
    const dmg = 8 + Math.floor(Math.random() * 7);
    if (target.isPlayer) {
      const died = S.player.takeDamage(dmg, bot.name);
      S.events.push({ type: 'hurt', from: bot.name });
      audio.hurt();
      if (died) S.events.push({ type: 'playerDown', by: bot.name });
    } else {
      const died = damageBot(target.ref, dmg, 'body', bot);
      if (died) S.events.push({ type: 'botKill', killer: bot, victim: target.ref });
    }
  }

  function damageBot(bot, dmg, part, attacker) {
    if (!bot.alive) return false;
    bot.hp -= dmg;
    if (bot.hp < 30 && bot.state !== 'retreat') bot.state = 'retreat';
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      if (attacker === S.player) {
        S.player.money += 300;
        S.events.push({ type: 'kill', bot, byPlayer: true });
      }
      S.events.push({ type: 'death', bot, killer: attacker });
      return true;
    }
    return false;
  }

  function update(dt, now) {
    const rnd = S.rng || Math.random;
    const playing = S.mode === 'playing';
    for (const bot of S.bots) {
      if (!bot.alive) continue;
      bot.thinkTimer -= dt;
      if (bot.thinkTimer <= 0) {
        bot.thinkTimer = 0.2 + rnd() * 0.15;
        // Objective roles override combat when the bomb is in play.
        if (S.bomb.state === 'planted' && bot.team !== S.attackSide) {
          bot.state = 'defuse';
        } else if (bot.hasBomb && bot.team === S.attackSide && S.bomb.state === 'carried') {
          bot.state = 'plant';
        } else if (bot.state === 'retreat' && bot.hp > 55) {
          bot.state = 'patrol';
        } else if (bot.state !== 'plant' && bot.state !== 'defuse') {
          const t = playing ? pickTarget(bot) : null;
          if (t) {
            bot.target = t;
            bot.state = 'engage';
          } else if (bot.state === 'engage') {
            bot.state = 'patrol';
            bot.target = null;
          }
        }
      }

      let moveX = 0;
      let moveZ = 0;
      let speed = 0;
      if (playing) {
        if (bot.state === 'engage' && bot.target) {
          const t = bot.target;
          const dx = t.x - bot.x;
          const dz = t.z - bot.z;
          const d = Math.hypot(dx, dz);
          bot.yaw = Math.atan2(-dx, -dz);
          // Hold a firing distance: close in if far, strafe if close.
          bot.strafeTimer -= dt;
          if (bot.strafeTimer <= 0) { bot.strafeTimer = 0.8 + rnd() * 0.8; bot.strafeDir = rnd() > 0.5 ? 1 : -1; }
          if (d > 16) { moveX = dx / d; moveZ = dz / d; speed = 3.2; }
          else { moveX = Math.cos(bot.yaw) * bot.strafeDir; moveZ = -Math.sin(bot.yaw) * bot.strafeDir; speed = 2.2; }
          shootAt(bot, t, dt);
        } else if (bot.state === 'retreat') {
          // Run to the nearest waypoint behind the bot, away from the fight.
          if (!bot.waypoint) bot.waypoint = nearestWaypoint(bot, rnd);
          const dx = bot.waypoint.x - bot.x;
          const dz = bot.waypoint.z - bot.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.2) { bot.waypoint = nearestWaypoint(bot, rnd); }
          else { moveX = dx / d; moveZ = dz / d; speed = 3.8; bot.yaw = Math.atan2(-dx, -dz); }
        } else if (bot.state === 'plant') {
          const site = S.bomb.site ? world.sites[S.bomb.site] : world.sites.A;
          const dx = site.x - bot.x;
          const dz = site.z - bot.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.5) {
            bot.plantProgress += dt;
            S.bomb.progress = bot.plantProgress / CONFIG.plantTime;
            if (bot.plantProgress >= CONFIG.plantTime) {
              S.events.push({ type: 'botPlanted', by: bot, site: S.bomb.site || 'A' });
              bot.hasBomb = false;
              bot.state = 'patrol';
            }
          } else {
            moveX = dx / d; moveZ = dz / d; speed = 3.4;
            bot.yaw = Math.atan2(-dx, -dz);
          }
        } else if (bot.state === 'defuse') {
          const site = world.sites[S.bomb.site];
          const dx = site.x - bot.x;
          const dz = site.z - bot.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.5) {
            bot.defuseProgress += dt;
            S.bomb.progress = bot.defuseProgress / CONFIG.defuseTime;
            if (bot.defuseProgress >= CONFIG.defuseTime) {
              S.events.push({ type: 'botDefused', by: bot });
              bot.state = 'patrol';
            }
          } else {
            moveX = dx / d; moveZ = dz / d; speed = 3.6;
            bot.yaw = Math.atan2(-dx, -dz);
          }
        } else {
          // Patrol: walk the waypoint graph.
          if (!bot.waypoint) bot.waypoint = nearestWaypoint(bot, rnd);
          const dx = bot.waypoint.x - bot.x;
          const dz = bot.waypoint.z - bot.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.2) {
            bot.waypoint = nearestWaypoint(bot, rnd);
          } else {
            moveX = dx / d; moveZ = dz / d; speed = 3.2;
            bot.yaw = Math.atan2(-dx, -dz);
          }
        }
      }

      if (speed > 0) {
        moveCircle(bot, moveX * speed * dt, moveZ * speed * dt, 0.4, world.colliders);
        bot.x = clamp(bot.x, -31.4, 31.4);
        bot.z = clamp(bot.z, -21.4, 21.4);
        bot.walkPhase += dt * speed * 2.4;
      }
      bot.group.position.set(bot.x, bot.alive ? Math.abs(Math.sin(bot.walkPhase)) * 0.04 : 0.25, bot.z);
      if (bot.alive) bot.group.rotation.y = bot.yaw;
    }
  }

  return { spawnBots, update, damageBot };
}
