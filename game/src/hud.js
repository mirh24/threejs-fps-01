// The HUD: health and armor, ammo, money, the round timer, the
// team score, the kill feed, the bomb status, weapon slots, a
// crosshair whose gap reflects spread, a red hitmarker for headshots,
// a damage direction indicator, the buy menu and the round banner.
// Every element lives in index.html; this module only writes to it,
// and only when a value actually changed.
import { formatClock, formatMoney } from './util.js';
import { BUY_MENU } from './weapons.js';

function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'health', 'armor', 'ammo', 'reserve', 'money', 'timer', 'score',
      'round', 'killfeed', 'bomb-status', 'slots', 'crosshair', 'hitmarker',
      'damage-dir', 'banner', 'banner-title', 'banner-sub', 'buy-menu',
      'buy-list', 'overlay', 'overlay-title', 'overlay-sub', 'overlay-hint',
      'plant-bar', 'plant-fill', 'plant-label', 'site-label', 'objective',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.lastCrossGap = -1;
    this.lastHealth = -1;
    this.hitAt = 0;
    this.damageAt = 0;
    this.buildBuyMenu();
  }

  buildBuyMenu() {
    const list = this.el['buy-list'];
    if (!list) return;
    list.innerHTML = '';
    for (const item of BUY_MENU) {
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.dataset.item = item.id;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-note">${item.note}</span><span class="buy-price">${item.price === 0 ? 'FREE' : formatMoney(item.price)}</span>`;
      list.appendChild(row);
    }
  }

  showBuyMenu(show, money) {
    if (!this.el['buy-menu']) return;
    this.el['buy-menu'].classList.toggle('hidden', !show);
    if (show) {
      setText(this.el.money, formatMoney(money));
      for (const row of this.el['buy-list'].children) {
        const item = BUY_MENU.find((b) => b.id === row.dataset.item);
        row.classList.toggle('poor', item && money < item.price);
      }
    }
  }

  flashBuy(itemId, result) {
    const row = this.el['buy-list']?.querySelector(`[data-item="${itemId}"]`);
    if (!row) return;
    row.classList.remove('bought', 'denied');
    void row.offsetWidth;
    row.classList.add(result === 'ok' ? 'bought' : 'denied');
  }

  update(state) {
    const { player, economy, match, bomb, spread } = state;
    if (this.el.hud) this.el.hud.classList.toggle('hidden', match.phase === 'menu');
    setText(this.el.health, String(Math.ceil(player.health)));
    if (this.el.health) {
      this.el.health.classList.toggle('low', player.health <= 30);
    }
    setText(this.el.armor, economy.hasKevlar ? String(Math.ceil(player.armor)) : '—');
    const weapon = player.currentWeapon;
    if (weapon) {
      setText(this.el.ammo, String(weapon.mag));
      setText(this.el.reserve, String(weapon.reserve));
    }
    setText(this.el.money, formatMoney(economy.money));
    setText(this.el.timer, formatClock(match.clock));
    if (this.el.timer) this.el.timer.classList.toggle('low', match.phase === 'live' && match.clock <= 10);
    setText(this.el.score, match.scoreText());
    setText(this.el.round, `ROUND ${match.round} / 9`);
    // Crosshair gap follows spread; aiming pulls it tight.
    const gap = Math.round(4 + spread * 260);
    if (gap !== this.lastCrossGap && this.el.crosshair) {
      this.el.crosshair.style.setProperty('--gap', `${gap}px`);
      this.lastCrossGap = gap;
    }
    if (this.el.crosshair) this.el.crosshair.classList.toggle('hidden', match.phase !== 'live');
    // Weapon slots.
    if (this.el.slots) {
      const html = player.slots.map((slot, i) => {
        const active = i === player.currentSlot ? ' active' : '';
        const empty = slot.mag === 0 && slot.reserve === 0 ? ' empty' : '';
        return `<span class="slot${active}${empty}">${i + 1} ${slot.def.name} ${slot.mag}/${slot.reserve}</span>`;
      }).join('');
      if (this.el.slots.dataset.html !== html) {
        this.el.slots.innerHTML = html;
        this.el.slots.dataset.html = html;
      }
    }
    // Bomb status line.
    let bombText = '';
    if (bomb.state === 'carried') bombText = bomb.carrier === player ? 'BOMB: YOU CARRY IT — PLANT AT A OR B' : 'BOMB: WITH YOUR TEAM';
    else if (bomb.state === 'dropped') bombText = 'BOMB: DROPPED — WALK OVER IT TO PICK UP';
    else if (bomb.state === 'planted') bombText = `BOMB PLANTED AT ${bomb.site} — ${formatClock(bomb.timer)} TO DETONATION`;
    else if (bomb.state === 'exploded') bombText = 'BOMB DETONATED';
    else if (bomb.state === 'defused') bombText = 'BOMB DEFUSED';
    setText(this.el['bomb-status'], bombText);
    if (this.el['bomb-status']) this.el['bomb-status'].classList.toggle('danger', bomb.state === 'planted');
    // Plant / defuse progress bar.
    const progress = bomb.plantProgress > 0 ? bomb.plantProgress : bomb.defuseProgress;
    const label = bomb.plantProgress > 0 ? 'PLANTING…' : bomb.defuseProgress > 0 ? 'DEFUSING…' : '';
    if (this.el['plant-bar']) {
      this.el['plant-bar'].classList.toggle('hidden', progress <= 0);
      if (progress > 0 && this.el['plant-fill']) this.el['plant-fill'].style.width = `${Math.round(progress * 100)}%`;
      setText(this.el['plant-label'], label);
    }
    // Objective line: which site the carrier should hit.
    if (match.phase === 'live' && bomb.state === 'carried') {
      setText(this.el.objective, bomb.carrier === player ? 'PLANT THE BOMB AT A (WAREHOUSE) OR B (FUEL DEPOT)' : 'ESCORT THE BOMB CARRIER TO A OR B');
    } else if (match.phase === 'buy') {
      setText(this.el.objective, 'BUY PHASE — PRESS B FOR THE BUY MENU');
    } else {
      setText(this.el.objective, '');
    }
  }

  showHitmarker(headshot) {
    if (!this.el.hitmarker) return;
    this.el.hitmarker.classList.remove('head', 'show');
    void this.el.hitmarker.offsetWidth;
    if (headshot) this.el.hitmarker.classList.add('head');
    this.el.hitmarker.classList.add('show');
    this.hitAt = performance.now();
  }

  showDamageFrom(angleDeg) {
    const el = this.el['damage-dir'];
    if (!el) return;
    el.style.setProperty('--rot', `${angleDeg}deg`);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.damageAt = performance.now();
  }

  addKill(killer, victim, headshot) {
    const feed = this.el.killfeed;
    if (!feed) return;
    const row = document.createElement('div');
    row.className = 'kill-row';
    row.innerHTML = `<span class="killer">${killer}</span><span class="kill-weapon">${headshot ? '◉' : '✕'}</span><span class="victim">${victim}</span>`;
    feed.prepend(row);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => row.classList.add('fade'), 4200);
    setTimeout(() => row.remove(), 5000);
  }

  showBanner(title, sub, team) {
    if (!this.el.banner) return;
    setText(this.el['banner-title'], title);
    setText(this.el['banner-sub'], sub);
    this.el.banner.classList.remove('hidden', 'vanguard', 'ember');
    if (team) this.el.banner.classList.add(team);
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 3800);
  }

  showOverlay(title, sub, hint) {
    if (!this.el.overlay) return;
    setText(this.el['overlay-title'], title);
    setText(this.el['overlay-sub'], sub);
    setText(this.el['overlay-hint'], hint);
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay?.classList.add('hidden');
  }

  setSiteLabel(text) {
    setText(this.el['site-label'], text);
  }
}
