// Time helpers shared by the clash engine and the agents.
// shortcut: one fixed time zone (IST, +05:30), upgrade if sellers outside India
export const H = 3_600_000;
const IST = 5.5 * H;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ist = (ms: number) => new Date(ms + IST); // read with getUTC* to get IST wall-clock values

/** 2026-11-28T16:00:00+05:30 */
export const iso = (ms: number) => ist(ms).toISOString().slice(0, 19) + '+05:30';
/** 16:00 */
export const hhmm = (ms: number) => ist(ms).toISOString().slice(11, 16);
/** Sat 28 Nov 16:00 */
export const fmt = (ms: number) => { const d = ist(ms); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hhmm(ms)}`; };
/** Fractional IST hour of day, e.g. 16.5 */
export const hourOf = (ms: number) => ((ms + IST) % (24 * H)) / H;
/** IST calendar day number, for same-day checks */
export const dayOf = (ms: number) => Math.floor((ms + IST) / (24 * H));
