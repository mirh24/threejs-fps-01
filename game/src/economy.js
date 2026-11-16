// The economy: each player starts a match with $800. Kills and
// plants pay $300, a round win pays $3250, a loss pays $1900 plus
// $500 per consecutive loss up to $3400. Dying costs the bought
// primary, the armor and the grenades; the issued pistol and rifle
// stay. All money lives here, in one place.
import { GRENADE, KEVLAR_PRICE, WEAPONS } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_BASE = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_MAX = 3400;

export class Economy {
  constructor() {
    this.money = START_MONEY;
    this.consecutiveLosses = 0;
    this.grenades = 0;
    this.hasKevlar = false;
  }

  canAfford(price) {
    return this.money >= price;
  }

  // Buy one item by id. Returns 'ok', 'poor' or 'owned'.
  buy(itemId, ownedWeapons) {
    if (itemId === 'he') {
      if (this.grenades >= 2) return 'owned';
      if (!this.canAfford(GRENADE.price)) return 'poor';
      this.money -= GRENADE.price;
      this.grenades += 1;
      return 'ok';
    }
    if (itemId === 'kevlar') {
      if (this.hasKevlar) return 'owned';
      if (!this.canAfford(KEVLAR_PRICE)) return 'poor';
      this.money -= KEVLAR_PRICE;
      this.hasKevlar = true;
      return 'ok';
    }
    const def = WEAPONS[itemId];
    if (!def) return 'poor';
    if (ownedWeapons.includes(itemId)) return 'owned';
    if (!this.canAfford(def.price)) return 'poor';
    this.money -= def.price;
    return 'ok';
  }

  rewardKill() {
    this.money += KILL_REWARD;
  }

  rewardPlant() {
    this.money += PLANT_REWARD;
  }

  // End-of-round payout. A win resets the loss streak; a loss grows it.
  settleRound(won) {
    if (won) {
      this.money += WIN_REWARD;
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses += 1;
      const payout = Math.min(LOSS_MAX, LOSS_BASE + LOSS_STREAK_BONUS * (this.consecutiveLosses - 1));
      this.money += payout;
    }
  }

  // Death strips bought gear: primary weapon, armor, grenades.
  onDeath(primaryId) {
    this.grenades = 0;
    this.hasKevlar = false;
    return primaryId;
  }

  reset() {
    this.money = START_MONEY;
    this.consecutiveLosses = 0;
    this.grenades = 0;
    this.hasKevlar = false;
  }
}
