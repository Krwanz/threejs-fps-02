// Rounds and the match: buy phase, live round, bomb plant/defuse, elimination,
// the economy and the score. Sides swap every round; the first team to five
// round wins takes the match (at most nine rounds).
import * as THREE from 'three';
import { CONFIG, ECONOMY, WEAPONS, SHOP } from './state.js';

export function createRounds(scene, world, S, audio) {
  // The planted bomb: a small blinking charge that appears on the site.
  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  );
  bombLight.position.set(0.2, 0.2, 0);
  bombMesh.add(bombBody, bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  let endTimer = 0;
  let blinkTimer = 0;

  function attackSideFor(round) {
    return round % 2 === 1 ? 'vipers' : 'jackals';
  }

  function startMatch() {
    S.score.vipers = 0;
    S.score.jackals = 0;
    S.round = 1;
    S.player.money = ECONOMY.start;
    S.player.weapons = { pistol: { mag: 12, reserve: 36 } };
    S.player.grenades = 0;
    S.player.armor = 0;
    S.player.current = 'pistol';
    startRound();
  }

  function startRound() {
    const rnd = S.rng || Math.random;
    S.attackSide = attackSideFor(S.round);
    S.bomb = { state: S.playerSide === S.attackSide ? 'carried' : 'enemy', x: 0, z: 0, site: null, timer: 0, progress: 0, planter: null };
    if (S.attackSide === 'jackals') S.bomb.site = rnd() > 0.5 ? 'A' : 'B';
    bombMesh.visible = false;

    // Spawn the player on the side their team is playing this round.
    const attackSpawns = world.spawns.vipers; // south
    const defenseSpawns = world.spawns.jackals; // north
    const mySpawns = S.playerSide === S.attackSide ? attackSpawns : defenseSpawns;
    const spawn = mySpawns[S.player.spawnIndex % mySpawns.length];
    S.playerApi.spawnAt(spawn);
    S.playerApi.healFull();
    S.botsApi.spawnBots();
    S.mode = 'buy';
    S.roundTimer = CONFIG.buyTime;
    S.buyOpen = true;
    S.spectate = null;
    S.events.push({ type: 'roundStart', round: S.round, attackSide: S.attackSide });
  }

  function aliveCount(team) {
    let n = 0;
    if (team === S.playerSide && S.player.alive) n += 1;
    for (const b of S.bots) if (b.alive && b.team === team) n += 1;
    return n;
  }

  function endRound(winner, reason) {
    if (S.mode !== 'playing') return;
    S.mode = 'roundEnd';
    S.winner = winner;
    S.winReason = reason;
    S.score[winner] += 1;
    const loser = winner === 'vipers' ? 'jackals' : 'vipers';
    if (winner === S.playerSide) {
      S.player.money += ECONOMY.win;
      audio.roundWin();
    } else {
      S.player.money += ECONOMY.loss;
      audio.roundLose();
    }
    S.events.push({ type: 'roundEnd', winner, reason });
    endTimer = 4.5;
  }

  function endMatch() {
    S.mode = 'matchEnd';
    const v = S.score.vipers;
    const j = S.score.jackals;
    S.winner = v === j ? 'draw' : v > j ? 'vipers' : 'jackals';
    S.events.push({ type: 'matchEnd', winner: S.winner });
    if (S.winner === S.playerSide) audio.roundWin(); else audio.roundLose();
  }

  // Shared by the player (updateObjective) and by a bot carrier (via main.js):
  // put the bomb down on a site and start its timer.
  function plantBomb(site, by) {
    S.bomb.state = 'planted';
    S.bomb.site = site;
    S.bomb.timer = CONFIG.bombTimer;
    S.bomb.progress = 0;
    const s = world.sites[site];
    bombMesh.position.set(s.x, 0.15, s.z);
    bombMesh.visible = true;
    if (by === S.player) S.player.money += ECONOMY.plant;
    S.events.push({ type: 'planted', by, site });
    audio.plantBeep(true);
  }

  function defuseBomb(by) {
    S.bomb.state = 'defused';
    S.bomb.progress = 0;
    bombMesh.visible = false;
    if (by === S.player) S.player.money += ECONOMY.defuse;
    S.events.push({ type: 'defused', by });
    endRound(S.playerSide === S.attackSide ? (S.playerSide === 'vipers' ? 'jackals' : 'vipers') : S.playerSide, 'Bomb defused');
  }

  function buyItem(id) {
    const p = S.player;
    const item = SHOP.find((s) => s.id === id);
    if (!item) return false;
    if (p.money < item.price) { audio.denied(); return false; }
    if (id === 'rifle') {
      if (p.weapons.rifle) return false;
      p.money -= item.price;
      p.weapons.rifle = { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
      S.weaponsApi.switchTo('rifle');
    } else if (id === 'pistol') {
      p.money -= item.price;
      p.weapons.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    } else if (id === 'grenade') {
      if (p.grenades >= 2) return false;
      p.money -= item.price;
      p.grenades += 1;
    } else if (id === 'armor') {
      if (p.armor >= 100) return false;
      p.money -= item.price;
      p.armor = 100;
    } else if (id === 'ammo') {
      const def = WEAPONS[p.current];
      const ammo = p.weapons[p.current];
      if (ammo.reserve >= def.reserve) return false;
      p.money -= item.price;
      ammo.reserve = def.reserve;
    }
    audio.buy();
    S.events.push({ type: 'buy', item: id });
    return true;
  }

  // Hold-E progress for planting (attackers) and defusing (defenders).
  function updateObjective(dt, input) {
    const p = S.player;
    if (!p.alive || S.mode !== 'playing') { S.bomb.progress = 0; return; }
    const holding = !!input.keys.KeyE;
    const isAttacker = S.playerSide === S.attackSide;

    if (isAttacker && S.bomb.state === 'carried') {
      // Planting: must stand inside a site's marked plate.
      let site = null;
      for (const key of ['A', 'B']) {
        const s = world.sites[key];
        if (Math.abs(p.x - s.x) < 4 && Math.abs(p.z - s.z) < 3) site = key;
      }
      if (site && holding) {
        S.bomb.progress += dt / CONFIG.plantTime;
        if (Math.floor(S.bomb.progress * 10) !== Math.floor((S.bomb.progress - dt / CONFIG.plantTime) * 10)) audio.plantBeep(false);
        if (S.bomb.progress >= 1) {
          plantBomb(site, p);
        }
      } else {
        S.bomb.progress = Math.max(0, S.bomb.progress - dt * 0.5);
      }
      return;
    }

    if (!isAttacker && S.bomb.state === 'planted') {
      const s = world.sites[S.bomb.site];
      const near = Math.hypot(p.x - s.x, p.z - s.z) < 3.5;
      if (near && holding) {
        S.bomb.progress += dt / CONFIG.defuseTime;
        if (Math.floor(S.bomb.progress * 10) !== Math.floor((S.bomb.progress - dt / CONFIG.defuseTime) * 10)) audio.defuseBeep();
        if (S.bomb.progress >= 1) {
          defuseBomb(p);
        }
      } else {
        S.bomb.progress = Math.max(0, S.bomb.progress - dt * 0.5);
      }
    }
  }

  function update(dt, input) {
    if (S.mode === 'buy') {
      S.roundTimer -= dt;
      if (input.pressed('KeyB')) S.buyOpen = !S.buyOpen;
      if (S.roundTimer <= 0) {
        S.mode = 'playing';
        S.roundTimer = CONFIG.roundTime;
        S.buyOpen = false;
        S.events.push({ type: 'live' });
      }
      return;
    }

    if (S.mode === 'roundEnd') {
      endTimer -= dt;
      if (endTimer <= 0) {
        if (S.score.vipers >= CONFIG.winRounds || S.score.jackals >= CONFIG.winRounds || S.round >= CONFIG.maxRounds) {
          endMatch();
        } else {
          S.round += 1;
          startRound();
        }
      }
      return;
    }

    if (S.mode !== 'playing') return;

    // Bomb timer once planted.
    if (S.bomb.state === 'planted') {
      S.bomb.timer -= dt;
      blinkTimer += dt;
      bombLight.material.color.setHex(Math.floor(blinkTimer * 2) % 2 ? 0xff3020 : 0x551008);
      if (S.bomb.timer <= 0) {
        S.bomb.state = 'detonated';
        bombMesh.visible = false;
        S.events.push({ type: 'detonated' });
        audio.explosion();
        endRound(S.attackSide, 'Bomb detonated');
        return;
      }
    }

    updateObjective(dt, input);

    // Elimination check.
    const enemySide = S.playerSide === 'vipers' ? 'jackals' : 'vipers';
    if (aliveCount(enemySide) === 0) {
      endRound(S.playerSide, 'Enemy team eliminated');
      return;
    }
    if (aliveCount(S.playerSide) === 0) {
      endRound(enemySide, 'Your team was eliminated');
      return;
    }

    // Round clock: defenders win on time if the bomb is not planted.
    S.roundTimer -= dt;
    if (S.roundTimer <= 0 && S.bomb.state !== 'planted') {
      const defenseSide = S.attackSide === 'vipers' ? 'jackals' : 'vipers';
      endRound(defenseSide, 'Time expired — bomb never planted');
    }
  }

  return { startMatch, startRound, endRound, buyItem, update, aliveCount, plantBomb, defuseBomb };
}
