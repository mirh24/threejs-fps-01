// DUSTLINE boot, game loop, shooting, grenades and round flow.
// The simulation runs at a fixed 60 Hz step, apart from rendering,
// and all state lives in the one `game` object below. Bots, the bomb
// and the match machine are modules; this file wires them together.
import * as THREE from 'three';
import { clamp, lerp, mulberry32, dist2DSq } from './util.js';
import { PALETTE, TEAM_LABEL } from './palette.js';
import { AudioSys } from './audio.js';
import { WEAPONS, makeSlot, spreadFor, damageAtRange, makeViewModel, MuzzleFlash, GRENADE } from './weapons.js';
import { World, SPAWNS } from './world.js';
import { Player } from './player.js';
import { Economy } from './economy.js';
import { Bomb } from './bomb.js';
import { Match } from './rounds.js';
import { Bot } from './bots.js';
import { Input } from './input.js';
import { Hud } from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(SEED);

const game = {
  now: 0,
  scene: null,
  camera: null,
  renderer: null,
  world: null,
  player: null,
  economy: new Economy(),
  bomb: null,
  match: new Match(),
  bots: [],
  fighters: [],
  input: null,
  hud: null,
  audio: new AudioSys(),
  flash: null,
  viewModel: null,
  viewModels: {},
  tracers: [],
  grenades: [],
  explosions: [],
  shotLog: [],
  nextFireAt: 0,
  triggerLatch: false,
  reloading: false,
  reloadDoneAt: 0,
  shake: 0,
  spectate: null,
  started: false,
  lastFrame: performance.now(),
  acc: 0,
};

function eyeOf(fighter, out) {
  const eyeY = fighter.eyeY !== undefined ? fighter.eyeY : 1.55;
  out.set(fighter.pos.x, eyeY, fighter.pos.z);
  return out;
}

// ------------------------------------------------------------------ setup

function buildRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game-canvas') });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyTop);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  return { scene, camera };
}

function makeTracerPool(scene) {
  const pool = [];
  for (let i = 0; i < 14; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.tracer, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    pool.push({ line, life: 0 });
  }
  return pool;
}

function spawnTracer(from, to) {
  const slot = game.tracers.find((t) => t.life <= 0) ?? game.tracers[0];
  slot.line.geometry.setFromPoints([from, to]);
  slot.line.visible = true;
  slot.line.material.opacity = 0.85;
  slot.life = 0.09;
}

function updateTracers(dt) {
  for (const t of game.tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
    if (t.life <= 0) t.line.visible = false;
  }
}

function spawnExplosion(pos, radius) {
  const light = new THREE.PointLight(0xffa040, 120, radius * 4, 1.6);
  light.position.copy(pos).y += 1;
  game.scene.add(light);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9 }),
  );
  shell.position.copy(pos);
  game.scene.add(shell);
  game.explosions.push({ light, shell, life: 0.5, radius });
  game.audio.explosion();
  const d2 = dist2DSq(game.player.pos.x, game.player.pos.z, pos.x, pos.z);
  if (d2 < 30 * 30) game.shake = Math.max(game.shake, 0.5);
}

function updateExplosions(dt) {
  for (let i = game.explosions.length - 1; i >= 0; i--) {
    const ex = game.explosions[i];
    ex.life -= dt;
    const k = Math.max(0, ex.life / 0.5);
    ex.light.intensity = 120 * k;
    const scale = (1 - k) * ex.radius + 0.5;
    ex.shell.scale.setScalar(scale);
    ex.shell.material.opacity = k * 0.9;
    if (ex.life <= 0) {
      game.scene.remove(ex.light);
      game.scene.remove(ex.shell);
      ex.shell.geometry.dispose();
      ex.shell.material.dispose();
      game.explosions.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ fighters

function buildFighters() {
  const world = game.world;
  const player = new Player(world, SPAWNS.vanguard[0], 'vanguard');
  player.isBot = false;
  player.carryingBomb = false;
  game.player = player;
  const bots = [];
  for (let i = 0; i < 3; i++) {
    bots.push(new Bot(world, game.scene, 'vanguard', i, SPAWNS.vanguard[i + 1], rng));
  }
  for (let i = 0; i < 4; i++) {
    bots.push(new Bot(world, game.scene, 'ember', i, SPAWNS.ember[i], rng));
  }
  game.bots = bots;
  game.fighters = [player, ...bots];
}

function resetFighters() {
  const player = game.player;
  player.respawn(SPAWNS.vanguard[0]);
  player.slots = [makeSlot('p9'), makeSlot('ar77')];
  player.currentSlot = 1;
  player.carryingBomb = false;
  let vanguardIndex = 0;
  let emberIndex = 0;
  game.bots.forEach((bot) => {
    const spawn = bot.team === 'vanguard'
      ? SPAWNS.vanguard[1 + vanguardIndex++]
      : SPAWNS.ember[emberIndex++];
    bot.respawn(spawn);
    bot.slot = makeSlot('ar77');
    bot.assignedSite = bot.team === 'ember' ? (emberIndex % 2 === 1 ? 'A' : 'B') : null;
    bot.targetSite = null;
    bot.holdPos = null;
    bot.moveTarget = null;
  });
  // Refill reserves for the weapons the player still owns.
  for (const slot of player.slots) slot.reserve = slot.def.reserve;
  game.economy.grenades = 0;
  game.economy.hasKevlar = false;
  player.armor = 0;
}

function assignBombCarrier() {
  const attackers = game.fighters.filter((f) => f.team === 'vanguard' && f.alive);
  if (attackers.length === 0) return;
  const carrier = rng() < 0.3 ? game.player : attackers[Math.floor(rng() * attackers.length)];
  game.bomb.assign(carrier);
  carrier.carryingBomb = true;
  for (const f of attackers) if (f !== carrier) f.carryingBomb = false;
}

function startRound() {
  game.match.startRound();
  resetFighters();
  game.bomb.reset();
  assignBombCarrier();
  game.grenades = [];
  game.shotLog = [];
  game.spectate = null;
  game.hud.showBuyMenu(true, game.economy.money);
  game.hud.setSiteLabel('DUSTLINE — FREIGHT YARD AT DUSK');
  swapViewModel();
}

function startMatch() {
  game.economy.reset();
  game.match.startMatch();
  startRound();
  game.started = true;
  game.hud.hideOverlay();
}

// ------------------------------------------------------------------ combat

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function playerShoot() {
  const player = game.player;
  const slot = player.currentWeapon;
  if (!slot || player.reloading) return;
  const now = game.now;
  if (now < game.nextFireAt) return;
  if (slot.mag <= 0) {
    game.audio.dryFire();
    game.nextFireAt = now + 0.3;
    startReload();
    return;
  }
  const def = slot.def;
  game.nextFireAt = now + def.fireInterval;
  slot.mag -= 1;
  player.heat = Math.min(1, player.heat + (def.kind === 'sniper' ? 0.5 : 0.18));
  player.lastShotAt = now;
  eyeOf(player, _eye);
  player.forward(_dir);
  const spread = spreadFor(def, { moving: player.moving, airborne: !player.onGround, aiming: player.aiming, heat: player.heat });
  const jitter = () => (rng() + rng() + rng() - 1.5) * spread;
  _dir.x += jitter();
  _dir.y += jitter();
  _dir.z += jitter();
  _dir.normalize();
  _ray.set(_eye, _dir);
  _ray.far = def.range;
  const targets = [];
  for (const bot of game.bots) {
    if (bot.alive && bot.team !== player.team) targets.push(...bot.hitMeshes);
  }
  const hits = _ray.intersectObjects([...targets, ...game.world.blockers], false);
  const muzzle = _eye.clone().addScaledVector(_dir, 0.6);
  if (hits.length > 0) {
    const hit = hits[0];
    spawnTracer(muzzle, hit.point);
    const fighter = hit.object.userData.fighter;
    if (fighter) {
      const headshot = hit.object.userData.part === 'head';
      const damage = damageAtRange(def, hit.distance, headshot);
      game.audio.hit(headshot);
      game.hud.showHitmarker(headshot);
      damageFighter(fighter, damage, player, headshot);
    }
  } else {
    spawnTracer(muzzle, _eye.clone().addScaledVector(_dir, def.range));
  }
  game.flash.fire();
  game.audio.shot(def.id);
  game.viewModel.position.z = -0.55 + def.kick * 2;
  logShot(player.pos.x, player.pos.z, player.team);
}

function startReload() {
  const player = game.player;
  const slot = player.currentWeapon;
  if (!slot || player.reloading || slot.mag === slot.def.mag || slot.reserve <= 0) return;
  player.reloading = true;
  game.reloadDoneAt = game.now + slot.def.reloadTime;
  game.audio.reload();
}

function finishReload() {
  const player = game.player;
  const slot = player.currentWeapon;
  player.reloading = false;
  if (!slot) return;
  const needed = slot.def.mag - slot.mag;
  const taken = Math.min(needed, slot.reserve);
  slot.mag += taken;
  slot.reserve -= taken;
}

function throwGrenade() {
  const player = game.player;
  if (!player.alive || game.economy.grenades <= 0 || game.match.phase !== 'live') return;
  game.economy.grenades -= 1;
  eyeOf(player, _eye);
  player.forward(_dir);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.6, metalness: 0.4 }),
  );
  mesh.position.copy(_eye);
  game.scene.add(mesh);
  game.grenades.push({
    mesh,
    vel: _dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: GRENADE.fuse,
  });
  game.audio.grenadePin();
}

function updateGrenades(dt) {
  for (let i = game.grenades.length - 1; i >= 0; i--) {
    const g = game.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) {
      g.mesh.position.y = 0.12;
      g.vel.y *= -0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      const pos = g.mesh.position.clone();
      game.scene.remove(g.mesh);
      game.grenades.splice(i, 1);
      spawnExplosion(pos, GRENADE.radius);
      for (const fighter of game.fighters) {
        if (!fighter.alive) continue;
        const d = Math.sqrt(dist2DSq(fighter.pos.x, fighter.pos.z, pos.x, pos.z));
        if (d > GRENADE.radius) continue;
        const damage = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius) + 10);
        damageFighter(fighter, damage, game.player, false);
      }
    }
  }
}

function logShot(x, z, team) {
  game.shotLog.push({ x, z, team, at: game.now });
  if (game.shotLog.length > 24) game.shotLog.shift();
  for (const bot of game.bots) bot.hearShot(x, z, team, game.now);
}

function damageFighter(target, amount, attacker, headshot) {
  if (!target.alive) return;
  const taken = target.takeDamage(amount);
  void taken;
  if (target === game.player) {
    game.audio.hurt();
    const dx = attacker.pos.x - target.pos.x;
    const dz = attacker.pos.z - target.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    const relative = worldAngle + target.yaw;
    game.hud.showDamageFrom((relative * 180) / Math.PI);
    game.shake = Math.max(game.shake, 0.25);
  }
  if (!target.alive) handleDeath(target, attacker, headshot);
}

function handleDeath(target, attacker, headshot) {
  const killerName = attacker === game.player ? 'YOU' : attacker.name ?? '???';
  const victimName = target === game.player ? 'YOU' : target.name ?? '???';
  game.hud.addKill(killerName, victimName, headshot);
  if (attacker === game.player && target !== game.player) {
    game.economy.rewardKill();
  }
  if (target.carryingBomb) {
    target.carryingBomb = false;
    game.bomb.dropAt(target.pos.x, target.pos.z);
  }
  if (target === game.player) {
    // Death strips bought gear: primary, armor, grenades.
    const bought = game.player.slots.find((s) => s.def.price > 0);
    if (bought) {
      game.player.slots = game.player.slots.filter((s) => s !== bought);
      game.player.currentSlot = Math.min(game.player.currentSlot, game.player.slots.length - 1);
      swapViewModel();
    }
    game.economy.onDeath();
    game.player.armor = 0;
    const aliveMate = game.bots.find((b) => b.team === 'vanguard' && b.alive);
    game.spectate = aliveMate ?? null;
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (game.match.phase !== 'live') return;
  const vanguardAlive = game.fighters.some((f) => f.team === 'vanguard' && f.alive);
  const emberAlive = game.fighters.some((f) => f.team === 'ember' && f.alive);
  if (!vanguardAlive) endRound('ember', 'VANGUARD ELIMINATED');
  else if (!emberAlive) endRound('vanguard', 'EMBER ELIMINATED');
}

function endRound(winner, reason) {
  if (game.match.phase === 'over') return;
  const matchWinner = game.match.endRound(winner, reason, game.now);
  game.economy.settleRound(winner === 'vanguard');
  game.audio.roundSting(winner === 'vanguard');
  game.hud.showBuyMenu(false);
  const title = matchWinner
    ? `${TEAM_LABEL[matchWinner]} WINS THE MATCH`
    : `${TEAM_LABEL[winner]} WINS THE ROUND`;
  game.hud.showBanner(title, `${reason} — ${game.match.scoreText()}`, winner);
  game.input.exitLock();
}

function settleAfterRound() {
  if (game.match.over) {
    game.hud.showOverlay(
      `${TEAM_LABEL[game.match.matchWinner]} WINS THE MATCH`,
      `Final score ${game.match.scoreText()} — first to five rounds.`,
      'Press R to play again',
    );
    return;
  }
  game.match.nextRound();
  startRound();
}

// ------------------------------------------------------------------ buying

function buyItem(itemId) {
  if (game.match.phase !== 'buy') return;
  const owned = game.player.slots.map((s) => s.def.id);
  const result = game.economy.buy(itemId, owned);
  game.hud.flashBuy(itemId, result);
  if (result === 'ok') {
    game.audio.buyOk();
    if (itemId === 'kevlar') game.player.armor = 100;
    else if (itemId !== 'he') {
      game.player.slots.push(makeSlot(itemId));
      game.player.currentSlot = game.player.slots.length - 1;
      swapViewModel();
    }
  } else {
    game.audio.buyDeny();
  }
  game.hud.showBuyMenu(true, game.economy.money);
}

function swapViewModel() {
  const camera = game.camera;
  if (game.viewModel) camera.remove(game.viewModel);
  const slot = game.player.currentWeapon;
  if (!slot) return;
  if (!game.viewModels[slot.def.id]) game.viewModels[slot.def.id] = makeViewModel(slot.def.id);
  game.viewModel = game.viewModels[slot.def.id];
  game.viewModel.position.set(0.28, -0.26, -0.55);
  camera.add(game.viewModel);
  if (game.flash) game.flash.light.position.set(0.28, -0.2, -1.1);
}

// ------------------------------------------------------------------ input

function bindInput() {
  const input = game.input;
  input.onKey = (code) => {
    if (code === 'KeyB' && (game.match.phase === 'buy' || game.match.phase === 'live')) {
      const menu = document.getElementById('buy-menu');
      const open = menu.classList.contains('hidden');
      if (game.match.phase === 'buy' || open === false) game.hud.showBuyMenu(open, game.economy.money);
    }
    if (game.match.phase === 'buy' && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      const item = { Digit1: 'vulcan', Digit2: 'longshot', Digit3: 'he', Digit4: 'kevlar', Digit5: 'ar77' }[code];
      buyItem(item);
    } else if (game.match.phase === 'live' && ['Digit1', 'Digit2', 'Digit3'].includes(code)) {
      const index = parseInt(code.slice(-1), 10) - 1;
      if (game.player.slots[index]) {
        game.player.currentSlot = index;
        swapViewModel();
      }
    }
    if (code === 'KeyR') {
      if (game.match.over) {
        startMatch();
        input.requestLock();
      } else if (game.match.phase === 'live') {
        startReload();
      }
    }
    if (code === 'KeyG') throwGrenade();
    if (code === 'KeyQ' && game.match.phase === 'live') {
      game.player.currentSlot = (game.player.currentSlot + 1) % game.player.slots.length;
      swapViewModel();
    }
  };
  input.onMouseDown = (button) => {
    if (game.match.phase === 'menu') return;
    if (button === 0) game.triggerLatch = true;
    if (button === 2) game.player.aiming = true;
  };
  input.onMouseUp = (button) => {
    if (button === 2) game.player.aiming = false;
  };
  document.getElementById('buy-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('.buy-row');
    if (row) buyItem(row.dataset.item);
  });
  document.getElementById('overlay')?.addEventListener('click', () => {
    if (game.match.phase === 'menu' || game.match.over) {
      startMatch();
      input.requestLock();
    }
  });
  window.addEventListener('resize', () => {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ------------------------------------------------------------------ simulation

function simStep(dt) {
  const now = game.now;
  const match = game.match;
  const player = game.player;
  if (match.phase === 'buy' || match.phase === 'live') {
    const event = match.tick(dt);
    if (event === 'live') {
      game.hud.showBuyMenu(false);
    } else if (event === 'timeout') {
      endRound('ember', 'TIME EXPIRED — NO PLANT');
    }
  }
  if (match.phase === 'over' && now > match.bannerUntil) {
    settleAfterRound();
    return;
  }
  if (match.phase !== 'buy' && match.phase !== 'live') return;

  // Player movement and look.
  const { dx, dy } = game.input.consumeMouse();
  if (game.input.locked) player.look(dx, dy);
  const wish = game.input.moveWish();
  const crouch = game.input.down('ControlLeft') || game.input.down('KeyC');
  player.step(wish, dt, crouch);
  if (player.moving && player.onGround) game.audio.footstep(wish.z !== 0);

  // Reload timing.
  if (player.reloading && now >= game.reloadDoneAt) finishReload();

  // Shooting: auto weapons fire while held, single-shot weapons once.
  const slot = player.currentWeapon;
  if (slot && player.alive && match.phase === 'live') {
    if (slot.def.auto) {
      if (game.input.mouseDown) playerShoot();
    } else if (game.triggerLatch) {
      playerShoot();
    }
  }
  game.triggerLatch = false;

  // Plant / defuse on E.
  const holdingE = game.input.down('KeyE');
  if (player.alive && game.bomb.carrier === player && match.phase === 'live') {
    const siteId = game.world.insideSite('A', player.pos.x, player.pos.z)
      ? 'A'
      : game.world.insideSite('B', player.pos.x, player.pos.z) ? 'B' : null;
    if (game.bomb.plantStep(player, siteId, holdingE, dt)) {
      game.economy.rewardPlant();
      game.audio.roundSting(true);
      game.hud.showBanner('BOMB PLANTED', `AT SITE ${siteId} — DEFEND IT`, 'vanguard');
    } else if (holdingE && siteId) {
      game.audio.plantTick();
    }
  }

  // Bomb pickup by walking over it.
  if (game.bomb.state === 'dropped' && player.alive) {
    if (dist2DSq(player.pos.x, player.pos.z, game.bomb.pos.x, game.bomb.pos.z) < 1.4 * 1.4) {
      game.bomb.assign(player);
      player.carryingBomb = true;
    }
  }

  // Bomb timer and detonation.
  const bombEvent = game.bomb.update(dt, now);
  if (bombEvent === 'exploded') {
    spawnExplosion(game.bomb.pos, 12);
    endRound('vanguard', 'BOMB DETONATED');
    return;
  }

  // Bots.
  const ctx = {
    world: game.world,
    fighters: game.fighters,
    bomb: game.bomb,
    rng,
    damageFighter,
    tracer: spawnTracer,
    onPlant: (bot, siteId) => {
      game.hud.showBanner('BOMB PLANTED', `${bot.name} PLANTED AT SITE ${siteId}`, 'vanguard');
    },
    onDefuse: (bot) => {
      game.hud.showBanner('BOMB DEFUSED', `${bot.name} DEFUSED THE BOMB`, 'ember');
      endRound('ember', 'BOMB DEFUSED');
    },
    onPickup: () => {},
    onBotShot: (bot) => {
      logShot(bot.pos.x, bot.pos.z, bot.team);
      game.audio.distantShot();
    },
  };
  for (const bot of game.bots) bot.update(dt, now, ctx);

  updateGrenades(dt);
}

function renderFrame() {
  const player = game.player;
  const camera = game.camera;
  // A staged overview (the ?shot=start screenshot) keeps its camera.
  if (game.stagedOverview) {
    game.flash.update(1 / 60);
    updateTracers(1 / 60);
    updateExplosions(1 / 60);
    game.hud.update({ player, economy: game.economy, match: game.match, bomb: game.bomb, spread: 0.01 });
    game.renderer.render(game.scene, camera);
    return;
  }
  // Camera follows the player, or a living teammate while spectating.
  const focus = player.alive ? player : game.spectate;
  if (focus) {
    eyeOf(focus, _eye);
    camera.position.copy(_eye);
    if (focus === player) {
      camera.rotation.set(player.pitch, player.yaw, 0);
    } else {
      camera.rotation.set(0, focus.yaw, 0);
    }
  }
  if (game.shake > 0) {
    camera.rotation.x += (rng() - 0.5) * game.shake * 0.05;
    camera.rotation.z += (rng() - 0.5) * game.shake * 0.05;
    game.shake = Math.max(0, game.shake - 0.02);
  }
  // Aim narrows the field of view; the sniper zooms further.
  const targetFov = player.aiming ? (player.currentWeapon?.def.id === 'longshot' ? 38 : 55) : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 0.25);
    camera.updateProjectionMatrix();
  }
  // View-model bob and recoil recovery.
  if (game.viewModel) {
    const bob = player.moving ? Math.sin(game.now * 9) * 0.012 : 0;
    game.viewModel.position.y = -0.26 + bob;
    game.viewModel.position.x = 0.28 + (player.aiming ? -0.1 : 0);
    game.viewModel.position.z = lerp(game.viewModel.position.z, player.aiming ? -0.45 : -0.55, 0.2);
  }
  game.flash.update(1 / 60);
  updateTracers(1 / 60);
  updateExplosions(1 / 60);
  const spread = player.currentWeapon
    ? spreadFor(player.currentWeapon.def, { moving: player.moving, airborne: !player.onGround, aiming: player.aiming, heat: player.heat })
    : 0.01;
  game.hud.update({ player, economy: game.economy, match: game.match, bomb: game.bomb, spread });
  game.renderer.render(game.scene, camera);
}

function frame() {
  requestAnimationFrame(frame);
  const nowMs = performance.now();
  let dt = (nowMs - game.lastFrame) / 1000;
  game.lastFrame = nowMs;
  if (dt > 0.1) dt = 0.1;
  game.acc += dt;
  let steps = 0;
  while (game.acc >= STEP && steps < 5) {
    game.now += STEP;
    simStep(STEP);
    game.acc -= STEP;
    steps += 1;
  }
  renderFrame();
}

// ------------------------------------------------------------------ staged shots

function stageShot() {
  if (!SHOT) return;
  if (SHOT === 'start') {
    game.match.phase = 'menu';
    game.hud.showOverlay(
      'DUSTLINE',
      'Tactical FPS — freight yard at dusk. VANGUARD attacks, EMBER defends two bomb sites. First to five rounds.',
      'Click to play — WASD move, mouse aim, B buy menu, E plant / defuse',
    );
    game.stagedOverview = true;
    game.camera.position.set(6, 16, 30);
    game.camera.lookAt(0, 1, -6);
    return;
  }
  startMatch();
  if (SHOT === 'buy') {
    game.player.pos.set(-2, 0, 24);
    game.player.yaw = 0;
    game.hud.showBuyMenu(true, game.economy.money);
    return;
  }
  if (SHOT === 'play') {
    game.match.startLive();
    game.match.clock = 92;
    game.hud.showBuyMenu(false);
    // Ten seconds of bot play so the yard is alive in the frame.
    for (let i = 0; i < 10 * 60; i++) {
      game.now += STEP;
      simStep(STEP);
    }
    game.player.pos.set(2, 0, 16);
    game.player.yaw = 0.15;
    game.player.pitch = 0.02;
    return;
  }
  if (SHOT === 'end') {
    game.match.score = { vanguard: 2, ember: 1 };
    game.match.round = 4;
    game.match.startLive();
    for (let i = 0; i < 5 * 60; i++) {
      game.now += STEP;
      simStep(STEP);
    }
    endRound('vanguard', 'BOMB DETONATED');
    // Keep the banner up for the screenshot: no settle, no auto-hide.
    game.match.bannerUntil = Infinity;
    game.hud.showBanner('VANGUARD WINS THE ROUND', `BOMB DETONATED — ${game.match.scoreText()}`, 'vanguard');
    clearTimeout(game.hud.bannerTimer);
    game.player.pos.set(0, 0, 16);
    game.player.yaw = 0;
    game.player.pitch = 0;
  }
}

// ------------------------------------------------------------------ boot

function boot() {
  game.renderer = buildRenderer();
  const { scene, camera } = buildScene();
  game.scene = scene;
  game.camera = camera;
  game.world = new World(scene, rng);
  game.bomb = new Bomb(scene);
  game.tracers = makeTracerPool(scene);
  buildFighters();
  resetFighters();
  game.input = new Input(game.renderer.domElement);
  game.hud = new Hud();
  game.flash = new MuzzleFlash(scene);
  camera.add(game.flash.light);
  game.flash.light.position.set(0.28, -0.2, -1.1);
  bindInput();
  swapViewModel();
  game.audio.ensure();
  if (SHOT) {
    stageShot();
  } else {
    game.hud.showOverlay(
      'DUSTLINE',
      'Tactical FPS — freight yard at dusk. VANGUARD attacks, EMBER defends two bomb sites. First to five rounds.',
      'Click to play — WASD move, mouse aim, B buy menu, E plant / defuse',
    );
  }
  game.lastFrame = performance.now();
  requestAnimationFrame(frame);
}

boot();
