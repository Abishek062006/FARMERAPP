// services/dispatchWindow.js
//
// HOW LONG A JOB STAYS ON OFFER BEFORE IT REPORTS "no_agents".
//
// ═══ WHY IT WAS FIVE MINUTES, AND WHY THAT WAS WRONG ══════════════════════
//
// The window was `5 * 60 * 1000`, declared SEPARATELY in routes/orders.js and
// routes/consignments.js. Five minutes only works if a captain is staring at
// the screen — and this app has no push notifications and no background
// location, deliberately (Expo Go). A tempo driver is DRIVING. They cannot be
// watching a feed.
//
// So `no_agents` did not mean "nobody wants this run". It meant "nobody was
// looking at a phone in the last five minutes", and the buyer could not tell
// the difference. That is the app lying about the world, which is the one
// thing this codebase is otherwise careful not to do.
//
// ═══ FOUR HOURS, NOT EIGHT ════════════════════════════════════════════════
//
// Almost the entire gain is in the first jump: 5 min → 4 h captures it, and
// 4 h → 8 h adds very little matching probability while DOUBLING two real
// costs — the farmer's stock is held off the market the whole time (a lapse to
// `no_agents` deliberately does not restock, see routes/orders.js), and
// perishables sit that much longer.
//
// Four hours also matches how the trade runs: in morning and afternoon slots.
// A pickup offered at 7am that nobody has taken by 11am is not happening that
// morning — and the buyer wants to know at 11am, while they can still ring a
// tempo owner themselves. An eight-hour window burns the whole trading day
// before telling them.
const DISPATCH_WINDOW_MS = 4 * 60 * 60 * 1000;

// ── ⚠️ THE WINDOW MUST NOT RUN OVERNIGHT ──────────────────────────────────
//
// A run offered at 5pm with a four-hour window would expire at 9pm. Nobody is
// driving to a farm at 9pm, so those hours are fake availability: the job sits
// "open" through the evening and reports `no_agents` at nine, having been
// un-takeable for most of its life. That is the five-minute problem again in a
// new costume — a deadline that does not describe reality.
//
// So the window is CLIPPED to the end of the working day. A job offered late
// gets a short, honest window that ends when driving does, and the buyer learns
// tonight rather than discovering it tomorrow.
const DAY_ENDS_HOUR = 19;          // 7pm — last realistic hour to start a farm run
const DAY_STARTS_HOUR = 6;         // 6am
// Below this there is no point offering at all — nobody can reach a farm.
const MIN_USEFUL_WINDOW_MS = 20 * 60 * 1000;

/**
 * When a job offered `from` should stop being offered.
 *
 * Returns { expiresAt, clipped, reason } — `clipped` is true when the evening
 * cutoff shortened it, so a caller can SAY SO rather than showing a countdown
 * that looks arbitrarily short.
 */
function dispatchExpiryFrom(from = new Date()) {
  let start = new Date(from);

  // ── OFFERED BEFORE THE WORKING DAY STARTS ────────────────────────────
  // The mirror of the evening case, and just as real: a job posted at 2am
  // would otherwise get a "full" four-hour window expiring at 6am — four hours
  // in which nobody is awake to take it, reporting `no_agents` at dawn. The
  // clock starts when driving does.
  if (start.getHours() < DAY_STARTS_HOUR) {
    const dawn = new Date(start);
    dawn.setHours(DAY_STARTS_HOUR, 0, 0, 0);
    return {
      expiresAt: new Date(dawn.getTime() + DISPATCH_WINDOW_MS),
      clipped: true,
      reason: `Offered before ${DAY_STARTS_HOUR}:00. The four hours start at first light, so this `
        + 'is not counted down while nobody could have taken it.',
    };
  }

  const full = new Date(start.getTime() + DISPATCH_WINDOW_MS);

  const dayEnd = new Date(start);
  dayEnd.setHours(DAY_ENDS_HOUR, 0, 0, 0);

  // Offered after the working day has already ended: give it until the cutoff
  // TOMORROW rather than a dead window tonight. A job posted at 10pm is really
  // a job for the morning, and pretending otherwise expires it while everyone
  // is asleep.
  if (start >= dayEnd) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(DAY_STARTS_HOUR, 0, 0, 0);
    const morningEnd = new Date(tomorrow.getTime() + DISPATCH_WINDOW_MS);
    return {
      expiresAt: morningEnd,
      clipped: true,
      reason: 'Offered after the working day. Captains will see it from '
        + `${DAY_STARTS_HOUR}:00 tomorrow, and it stays open four hours from then.`,
    };
  }

  if (full <= dayEnd) return { expiresAt: full, clipped: false, reason: null };

  // Clipped by the cutoff. If what is left is too short to be worth offering,
  // say so plainly instead of posting a job nobody can take.
  const left = dayEnd - start;
  if (left < MIN_USEFUL_WINDOW_MS) {
    return {
      expiresAt: dayEnd,
      clipped: true,
      tooLate: true,
      reason: `Only ${Math.round(left / 60000)} minutes of the working day are left, so this is `
        + 'unlikely to be taken today. Consider posting it in the morning instead.',
    };
  }
  return {
    expiresAt: dayEnd,
    clipped: true,
    reason: `This closes at ${DAY_ENDS_HOUR}:00 rather than running the full four hours — `
      + 'nobody drives to a farm after dark, and a window that outlives the working day would '
      + 'report "no captains" for hours in which none could have come anyway.',
  };
}

module.exports = {
  DISPATCH_WINDOW_MS,
  DAY_ENDS_HOUR,
  DAY_STARTS_HOUR,
  MIN_USEFUL_WINDOW_MS,
  dispatchExpiryFrom,
};
