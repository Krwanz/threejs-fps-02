// Dustline Yard — one place for every tuning number, weapon, price and rule.
// The simulation reads only this file for its constants, so a balance change is
// one edit here and the code never hardcodes a damage or price elsewhere.
export const PALETTE = {
  sky: 0xe8c98f,        // warm dusk sky
  fog: 0xd9b98a,
  sand: 0xc9a06b,       // ground
  sandDark: 0xa9854f,
  wall: 0xb98d5e,       // plaster walls
  wallTop: 0x8f6b45,
  teal: 0x2f8f7a,       // site A accent + Jackals
  amber: 0xe8a13c,      // site B accent + Vipers
  crate: 0x7a5c38,
  crateDark: 0x5f4729,
  metal: 0x4a4f55,
  ink: 0xf2ead9,
  muted: 0xb9ac93,
  danger: 0xd94f3d,
};

export const CONFIG = {
  mapW: 64,             // x: -32..32
  mapD: 44,             // z: -22..22
  wallH: 4,
  roundTime: 100,       // seconds of live play per round
  buyTime: 15,          // seconds of buy phase before a round
  plantTime: 3,         // seconds holding E to plant
  defuseTime: 4,        // seconds holding E to defuse
  bombTimer: 35,        // seconds from plant to detonation
  winRounds: 5,         // first to this many round wins takes the match
  maxRounds: 9,
  gravity: 18,
  eyeStand: 1.62,
  eyeCrouch: 1.08,
  walkSpeed: 4.6,
  crouchSpeed: 2.4,
  accel: 42,
  friction: 11,
};

export const ECONOMY = {
  start: 800,
  win: 3250,
  loss: 1900,
  kill: 300,
  plant: 300,
  defuse: 300,
};

// Weapons: damage is per body hit; headshots multiply by headMult. Spread is in
// radians; spreadBloom grows per shot and decays, moveSpread punishes firing
// while moving, crouchSpread rewards holding still and low.
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'Vandal-9 rifle', price: 2700, auto: true,
    damage: 34, headMult: 4, rate: 0.1, mag: 25, reserve: 75,
    spread: 0.011, bloom: 0.004, moveSpread: 0.02, crouchSpread: 0.006,
    recoil: 0.011, kick: 0.35, range: 90, reloadTime: 2.2,
  },
  pistol: {
    id: 'pistol', name: 'Sidewinder pistol', price: 500, auto: false,
    damage: 26, headMult: 4, rate: 0.32, mag: 12, reserve: 36,
    spread: 0.014, bloom: 0.006, moveSpread: 0.016, crouchSpread: 0.008,
    recoil: 0.014, kick: 0.5, range: 60, reloadTime: 1.6,
  },
};

export const SHOP = [
  { id: 'rifle', name: 'Vandal-9 rifle', price: 2700, desc: 'Full-auto, 25-round mag. The workhorse.' },
  { id: 'pistol', name: 'Sidewinder pistol', price: 500, desc: 'Light sidearm, 12-round mag. Cheap and quick.' },
  { id: 'grenade', name: 'Spark grenade', price: 300, desc: 'Timed fuse, big radius. Clears a corner.' },
  { id: 'armor', name: 'Kevlar vest', price: 650, desc: 'Halves damage until it breaks (100 points).' },
  { id: 'ammo', name: 'Ammo refill', price: 200, desc: 'Tops up reserve ammo for the held weapon.' },
];

export const TEAMS = {
  vipers: { name: 'Sand Vipers', color: 0xe8a13c, short: 'VIP' },
  jackals: { name: 'Teal Jackals', color: 0x2f8f7a, short: 'JKL' },
};

// The one state object. main.js creates it; every module reads and writes fields
// on it, and nothing keeps a second copy of the match.
export function createState() {
  return {
    mode: 'menu',           // menu | buy | playing | roundEnd | matchEnd
    time: 0,                // total sim time (s)
    round: 1,
    score: { vipers: 0, jackals: 0 },
    playerSide: 'vipers',   // player attacks on odd rounds, defends on even
    roundTimer: CONFIG.buyTime,
    buyOpen: false,
    bomb: { state: 'carried', x: 0, z: 0, site: null, timer: 0, progress: 0, planter: null },
    player: null,           // filled by player.js
    bots: [],               // filled by bots.js
    hitMeshes: [],          // raycast targets: bot parts + world
    grenades: [],
    tracers: [],
    impacts: [],
    feed: [],               // kill feed entries
    winner: null,
    winReason: '',
    spectate: null,         // bot the camera follows when the player is down
    rng: null,              // seeded in shot mode, Math.random otherwise
    shot: null,             // 'start' | 'play' | 'end' when capturing
    events: [],             // { type, ... } consumed by hud/audio each frame
  };
}
