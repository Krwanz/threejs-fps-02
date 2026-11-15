// The HUD: health, armour, ammo, money, timer, score, crosshair with spread
// feedback, hitmarker, kill feed, round banners and the buy menu. All DOM —
// the 3D scene never draws UI, so the HUD is cheap and readable at a glance.
import { SHOP, TEAMS, WEAPONS } from './state.js';

function $(id) { return document.getElementById(id); }

export function createHud(S, callbacks) {
  const els = {
    hpFill: $('hp-fill'), hpNum: $('hp-num'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    money: $('money'), timer: $('timer'), score: $('score'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    feed: $('feed'), banner: $('banner'), bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'), buy: $('buy-menu'), buyList: $('buy-list'),
    buyMoney: $('buy-money'), overlay: $('overlay'), overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'), playBtn: $('play'),
    objective: $('objective'), bombBar: $('bomb-bar'), bombFill: $('bomb-fill'),
    hurt: $('hurt'), grenades: $('grenades'), weaponName: $('weapon-name'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  let hurtTimer = 0;

  // Build the buy menu once from the shop list.
  for (const item of SHOP) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => callbacks.onBuy(item.id));
    els.buyList.appendChild(row);
  }
  els.playBtn.addEventListener('click', () => callbacks.onPlay());

  function showBanner(title, sub, seconds = 3) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.hidden = false;
    bannerTimer = seconds;
  }

  function addFeed(text) {
    const div = document.createElement('div');
    div.className = 'feed-row';
    div.textContent = text;
    els.feed.prepend(div);
    while (els.feed.children.length > 5) els.feed.removeChild(els.feed.lastChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }

  function setOverlay(title, copy, button) {
    els.overlayTitle.textContent = title;
    els.overlayCopy.textContent = copy;
    els.playBtn.textContent = button;
    els.overlay.hidden = false;
  }

  function hideOverlay() { els.overlay.hidden = true; }

  function flashHurt() { hurtTimer = 0.45; }

  function showHitmarker(kill) {
    els.hitmarker.classList.toggle('kill', !!kill);
    els.hitmarker.classList.add('on');
    hitTimer = kill ? 0.35 : 0.15;
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function update(dt) {
    const p = S.player;
    if (!p) return;
    els.hpFill.style.width = `${p.hp}%`;
    els.hpFill.style.background = p.hp > 50 ? '#7ec850' : p.hp > 25 ? '#e8a13c' : '#d94f3d';
    els.hpNum.textContent = Math.ceil(p.hp);
    els.armorNum.textContent = Math.ceil(p.armor);
    const def = WEAPONS[p.current];
    const ammo = p.weapons[p.current];
    els.ammoMag.textContent = ammo ? ammo.mag : 0;
    els.ammoReserve.textContent = ammo ? `/ ${ammo.reserve}` : '';
    els.ammo.classList.toggle('empty', !ammo || ammo.mag === 0);
    els.weaponName.textContent = def.name;
    els.grenades.textContent = p.grenades > 0 ? `◉ ×${p.grenades}` : '';
    els.money.textContent = `$${p.money}`;
    els.buyMoney.textContent = `$${p.money}`;
    els.timer.textContent = fmtTime(S.roundTimer);
    els.timer.classList.toggle('urgent', S.roundTimer <= 10 && S.mode === 'playing');
    els.score.innerHTML = `<b>${TEAMS.vipers.short} ${S.score.vipers}</b> — <b>${TEAMS.jackals.short} ${S.score.jackals}</b> · Round ${S.round}`;
    els.buy.hidden = !S.buyOpen;
    // Crosshair gap follows the live spread: wide when moving or spraying.
    const spread = S.weaponsApi ? S.weaponsApi.spreadNow() : 0.012;
    const gap = Math.round(4 + spread * 900);
    els.crosshair.style.setProperty('--gap', `${gap}px`);

    // Objective hint and bomb progress.
    let hint = '';
    if (S.mode === 'buy') hint = 'Buy phase — press B for the shop, then deploy';
    else if (S.mode === 'playing' && p.alive) {
      if (S.playerSide === S.attackSide && S.bomb.state === 'carried') hint = 'You carry the bomb — reach Site A or B and hold E to plant';
      else if (S.bomb.state === 'planted') hint = S.playerSide === S.attackSide ? 'Bomb planted — defend it' : 'Bomb planted — hold E at the site to defuse';
      else if (S.bomb.state === 'enemy') hint = 'Defend Sites A and B — the enemy carries the bomb';
    } else if (!p.alive) hint = 'You are down — watching your team';
    els.objective.textContent = hint;
    els.bombBar.hidden = S.bomb.progress <= 0;
    els.bombFill.style.width = `${Math.round(S.bomb.progress * 100)}%`;

    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) els.hitmarker.classList.remove('on');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) els.banner.hidden = true;
    }
    els.hurt.style.opacity = hurtTimer > 0 ? String(hurtTimer * 1.6) : '0';
    if (hurtTimer > 0) hurtTimer -= dt;
  }

  return { update, showBanner, addFeed, setOverlay, hideOverlay, flashHurt, showHitmarker };
}
