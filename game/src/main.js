// Dustline Yard — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. The simulation (movement, bots, rounds) never
// touches the renderer; the render only reads positions and the HUD.
// ?shot=start|play|end&seed=N sets up a deterministic frame for a capture,
// renders it twice, freezes, and sets window.__shotReady.
import * as THREE from 'three';
import { createState, PALETTE } from './state.js';
import { mulberry32 } from './util.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const S = createState();
S.rng = shot ? mulberry32(seed) : Math.random;
S.shot = shot;

const world = createWorld(scene);
S.hitMeshes = world.hitMeshes;
const audio = createAudio();
const playerApi = createPlayer(world, S);
S.player = playerApi.player;
S.player.team = 'vipers';
S.playerApi = playerApi;
const botsApi = createBots(scene, world, S, audio);
S.botsApi = botsApi;
const weapons = createWeapons(scene, camera, S, audio, (bot, dmg, part) => botsApi.damageBot(bot, dmg, part, S.player));
S.weaponsApi = weapons;
const roundsApi = createRounds(scene, world, S, audio);
S.roundsApi = roundsApi;
const hud = createHud(S, {
  onBuy: (id) => roundsApi.buyItem(id),
  onPlay: () => startGame(),
});
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && S.mode === 'playing' && !S.shot) {
    hud.setOverlay('Paused', 'Pointer lock released. Click to jump back in.', 'Click to play');
  }
});

function startGame() {
  audio.unlock();
  hud.hideOverlay();
  if (S.mode === 'menu' || S.mode === 'matchEnd') roundsApi.startMatch();
  input.lock();
}

// Mouse look: consume deltas once per fixed step.
function applyMouse() {
  const { dx, dy } = input.consumeMouse();
  if (!S.player.alive) return;
  S.player.yaw -= dx * 0.0022;
  S.player.pitch -= dy * 0.0022;
  S.player.pitch = Math.max(-1.5, Math.min(1.5, S.player.pitch));
}

// Drain the event queue into HUD, audio and round side-effects.
function drainEvents() {
  for (const ev of S.events) {
    switch (ev.type) {
      case 'hit': hud.showHitmarker(false); break;
      case 'kill':
        hud.showHitmarker(true);
        hud.addFeed(`You ▸ ${ev.bot.name}`);
        break;
      case 'death':
        if (ev.killer && ev.killer !== S.player) hud.addFeed(`${ev.killer.name || '???'} ▸ ${ev.bot.name}`);
        break;
      case 'botKill': hud.addFeed(`${ev.killer.name} ▸ ${ev.victim.name}`); break;
      case 'hurt': hud.flashHurt(); break;
      case 'playerDown':
        hud.addFeed(`You were dropped by ${ev.by}`);
        hud.showBanner('You are down', 'Watching your team — the round plays on', 2.5);
        break;
      case 'roundStart':
        hud.showBanner(`Round ${ev.round}`, ev.attackSide === 'vipers' ? 'Sand Vipers attack — plant the bomb' : 'Teal Jackals attack — defend the sites', 3);
        break;
      case 'live': hud.showBanner('Go!', '', 1.2); break;
      case 'roundEnd':
        hud.showBanner(`${ev.winner === 'vipers' ? 'Sand Vipers' : 'Teal Jackals'} win the round`, ev.reason, 3.5);
        break;
      case 'planted':
        hud.showBanner('Bomb planted', `Site ${ev.site} — ${S.playerSide === S.attackSide ? 'defend it' : 'defuse it'}`, 3);
        hud.addFeed(`${ev.by.name || 'You'} planted the bomb`);
        break;
      case 'botPlanted': roundsApi.plantBomb(ev.site, ev.by); break;
      case 'botDefused': roundsApi.defuseBomb(ev.by); break;
      case 'defused': hud.showBanner('Bomb defused', 'The sites are safe — round over', 3); break;
      case 'detonated': hud.showBanner('Bomb detonated', 'Site destroyed', 3); break;
      case 'explosion':
        S.player.recoilPitch += (Math.random() - 0.5) * 0.05;
        break;
      case 'matchEnd': {
        const w = ev.winner;
        hud.setOverlay(
          w === 'draw' ? 'Draw' : w === S.playerSide ? 'Victory — Dustline Yard is yours' : 'Defeat',
          w === 'draw' ? `Tied ${S.score.vipers} — ${S.score.jackals}.` : `${w === 'vipers' ? 'Sand Vipers' : 'Teal Jackals'} take the match ${S.score.vipers} — ${S.score.jackals}.`,
          'Play again',
        );
        break;
      }
      default: break;
    }
  }
  S.events.length = 0;
}

function step(dt) {
  S.time += dt;
  applyMouse();
  if (S.mode === 'playing' || S.mode === 'buy' || S.mode === 'roundEnd') {
    playerApi.update(dt, input, audio);
    weapons.update(dt, S.time, input, playerApi);
    botsApi.update(dt, S.time);
    roundsApi.update(dt, input);
  }
  drainEvents();
  hud.update(dt);
}

function render() {
  if (S.mode === 'menu') {
    // Slow orbit over the yard behind the menu.
    const t = S.time * 0.05;
    camera.position.set(Math.cos(t) * 26, 14, Math.sin(t) * 26);
    camera.lookAt(0, 0, -4);
  } else if (!S.player.alive) {
    // Spectate the first living teammate.
    const mate = S.bots.find((b) => b.alive && b.team === S.playerSide);
    if (mate) {
      S.spectate = mate;
      camera.position.set(mate.x - Math.sin(mate.yaw) * -2.5, 2.2, mate.z - Math.cos(mate.yaw) * -2.5);
      camera.lookAt(mate.x + -Math.sin(mate.yaw) * 6, 1.4, mate.z + -Math.cos(mate.yaw) * 6);
    } else {
      playerApi.applyCamera(camera);
    }
  } else {
    playerApi.applyCamera(camera);
  }
  renderer.render(scene, camera);
}

let last = performance.now();
let acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  S.time += 0; // sim time advances in step()
  acc += dt;
  let n = 0;
  while (acc >= FIXED_STEP && n < 5) {
    step(FIXED_STEP);
    acc -= FIXED_STEP;
    n += 1;
  }
  if (n === 5) acc = 0;
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Deterministic screenshot setups ---------------------------------------
function setupShot(kind) {
  hud.hideOverlay();
  roundsApi.startMatch();
  S.mode = 'playing';
  S.roundTimer = 100;
  S.buyOpen = false;
  const p = S.player;
  if (kind === 'start') {
    // Cover: at the attack spawn, looking up the west lane — crates, a teammate
    // ahead, the long sightline to Site B.
    p.x = -8; p.z = 16; p.yaw = -0.3; p.pitch = -0.01;
    const mate = S.bots.find((b) => b.team === 'vipers');
    if (mate) { mate.x = -9; mate.z = 12; mate.yaw = 0; }
    const foe = S.bots.find((b) => b.team === 'jackals');
    if (foe) { foe.x = 2; foe.z = 4; foe.yaw = Math.PI; }
    S.player.weapons.rifle = { mag: 25, reserve: 75 };
    weapons.switchTo('rifle');
    hud.showBanner('Dustline Yard', 'Sand Vipers attack — plant the bomb at A or B', 3);
  } else if (kind === 'play') {
    // Mid-fight: an enemy bot dead-centre in the crosshair, tracer in the air.
    p.x = 5; p.z = 8; p.yaw = 0.165; p.pitch = 0.01;
    const foe = S.bots.find((b) => b.team === 'jackals');
    if (foe) { foe.x = 2; foe.z = -10; foe.yaw = Math.PI; }
    const mate = S.bots.find((b) => b.team === 'vipers');
    if (mate) { mate.x = 8; mate.z = 2; mate.yaw = 0.3; }
    S.player.weapons.rifle = { mag: 25, reserve: 75 };
    weapons.switchTo('rifle');
    weapons.debugFire();
    hud.showHitmarker(false);
  } else {
    // End: round won at Site A, bomb planted, banner up.
    p.x = 24; p.z = -8; p.yaw = 0; p.pitch = -0.02;
    S.score.vipers = 3;
    S.score.jackals = 2;
    S.player.weapons.rifle = { mag: 25, reserve: 75 };
    weapons.switchTo('rifle');
    roundsApi.plantBomb('A', p);
    S.mode = 'roundEnd';
    document.getElementById('timer').style.visibility = 'hidden';
    hud.showBanner('Sand Vipers win the round', 'Bomb detonated at Site A', 3);
  }
  playerApi.applyCamera(camera);
  // Shot mode runs no simulation loop, so sync the bot meshes to their
  // scripted positions by hand.
  for (const b of S.bots) {
    b.group.position.set(b.x, 0, b.z);
    b.group.rotation.y = b.yaw;
  }
  hud.update(0.016);
  hud.update(0.016);
  render();
  render();
  window.__shotReady = true;
}

// Debug hooks for scripted play-tests (used by the maker's own checks only).
window.__game = {
  S, startGame, weapons, roundsApi, botsApi, playerApi,
  teleport(x, z, yaw) {
    S.player.x = x; S.player.z = z;
    if (yaw !== undefined) S.player.yaw = yaw;
  },
  fire() { weapons.debugFire(); },
  press(code) { input.injectPress(code); },
  holdKey(code, down) { input.keys[code] = down; },
  // Advance the simulation by exact seconds, independent of frame rate.
  stepSim(seconds) {
    const n = Math.round(seconds / FIXED_STEP);
    for (let i = 0; i < n; i++) step(FIXED_STEP);
    render();
  },
  botCount: () => S.bots.filter((b) => b.alive).length,
};

if (shot) {
  setupShot(shot);
} else {
  hud.setOverlay(
    'Dustline Yard',
    'A tactical round-based shooter: plant the bomb or drop the other team. 4v4, two sites, buy between rounds.',
    'Click to play',
  );
  requestAnimationFrame(loop);
}
