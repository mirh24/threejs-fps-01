// The round and match state machine. A match is first to five
// rounds, at most nine. Each round opens with a 15-second buy phase,
// then 100 seconds of live play. The machine owns the phase, the
// clock and the score, and reports round ends as events the game
// loop turns into banners, payouts and resets.
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export class Match {
  constructor() {
    this.round = 1;
    this.score = { vanguard: 0, ember: 0 };
    this.phase = 'menu'; // menu | buy | live | over
    this.clock = BUY_TIME;
    this.lastWinner = null;
    this.lastReason = '';
    this.matchWinner = null;
    this.bannerUntil = 0;
  }

  startMatch() {
    this.round = 1;
    this.score = { vanguard: 0, ember: 0 };
    this.matchWinner = null;
    this.startRound();
  }

  startRound() {
    this.phase = 'buy';
    this.clock = BUY_TIME;
    this.lastWinner = null;
    this.lastReason = '';
  }

  startLive() {
    this.phase = 'live';
    this.clock = ROUND_TIME;
  }

  // Returns 'timeout' when the live clock runs out, else null.
  tick(dt) {
    if (this.phase !== 'buy' && this.phase !== 'live') return null;
    this.clock -= dt;
    if (this.phase === 'buy' && this.clock <= 0) {
      this.startLive();
      return 'live';
    }
    if (this.phase === 'live' && this.clock <= 0) return 'timeout';
    return null;
  }

  // Close a round: record the win, check the match, freeze play.
  endRound(winner, reason, now) {
    this.score[winner] += 1;
    this.lastWinner = winner;
    this.lastReason = reason;
    this.phase = 'over';
    this.bannerUntil = now + 4;
    if (this.score[winner] >= WIN_ROUNDS || this.round >= MAX_ROUNDS) {
      this.matchWinner = this.score.vanguard > this.score.ember ? 'vanguard' : 'ember';
    }
    return this.matchWinner;
  }

  nextRound() {
    this.round += 1;
    this.startRound();
  }

  get over() {
    return this.matchWinner !== null;
  }

  scoreText() {
    return `${this.score.vanguard} — ${this.score.ember}`;
  }
}
