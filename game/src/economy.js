// The round economy. Money is the tactics layer: start at $800, earn for
// kills, plants and round results, and spend it in the buy menu between
// rounds. The loss bonus grows with consecutive losses (capped), so a team on
// a losing streak can always buy back in.

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const ROUND_WIN = 3250;
export const ROUND_LOSS_BASE = 1900;
export const ROUND_LOSS_STEP = 500;
export const ROUND_LOSS_MAX = 3400;

export function createEconomy() {
  let money = START_MONEY;
  let lossStreak = 0;

  return {
    get money() {
      return money;
    },

    reset() {
      money = START_MONEY;
      lossStreak = 0;
    },

    add(amount) {
      money += amount;
    },

    spend(amount) {
      if (money < amount) return false;
      money -= amount;
      return true;
    },

    // Called once per finished round. A win pays flat and resets the streak;
    // a loss pays the base plus a step per consecutive loss, up to the cap.
    roundEnd(won) {
      if (won) {
        money += ROUND_WIN;
        lossStreak = 0;
      } else {
        const bonus = Math.min(ROUND_LOSS_MAX, ROUND_LOSS_BASE + lossStreak * ROUND_LOSS_STEP);
        money += bonus;
        lossStreak += 1;
      }
    },
  };
}
