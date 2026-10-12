/**
 * Date / datetime / time bound expressions used by `date`, `datetime`, `time`
 * and `daterange` field types.
 *
 * Supported grammar for dates and datetimes:
 *
 *   today                   — current UTC day, midnight
 *   now                     — current UTC instant
 *   2025-01-15              — absolute date
 *   2025-01-15T09:30        — absolute local datetime (no timezone)
 *   +5d / -5d               — today ± N days
 *   +2w / -2w               — today ± N weeks
 *   +3m / -3m               — today ± N calendar months (clamps overflow)
 *   +18y / -18y             — today ± N years (clamps overflow: Feb 29 → Feb 28)
 *   today+5d / today-18y    — explicit anchor + offset (identical to bare form)
 *   now+30m                 — `now` supports minute (`m` not month; see note below)
 *
 * For `time` fields the only valid values are absolute "HH:MM" strings
 * (24-hour). Relative expressions are not supported for time.
 *
 * Month/minute ambiguity: `m` is always calendar months except in expressions
 * rooted at `now`, where minute makes more sense. To keep the grammar simple,
 * `now±Nm` means minutes; `today±Nm` means months. Avoid passing `±Nm` without
 * an anchor when minute precision matters — use `now-30m` explicitly.
 */

export type DateBoundContext = "date" | "datetime" | "time";

export interface ResolvedBound {
	/** Concrete UTC Date. For `date`, midnight UTC. For `time`, today's date with HH:MM. */
	date: Date;
	/** Formatted for HTML native inputs: YYYY-MM-DD / YYYY-MM-DDTHH:MM / HH:MM. */
	iso: string;
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const TIME_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RELATIVE = /^(today|now)?\s*([+-])\s*(\d+)\s*([dwmy])$/i;

/** True if `bound` is a syntactically valid expression for `context`. */
export function isValidDateBound(bound: string, context: DateBoundContext): boolean {
	return resolveDateBound(bound, context, new Date()) !== null;
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function formatIsoDate(d: Date): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Format a Date as YYYY-MM-DDTHH:MM (UTC, matches <input type="datetime-local"> format). */
export function formatIsoDatetime(d: Date): string {
	const date = formatIsoDate(d);
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	return `${date}T${hh}:${mm}`;
}

/** Format a Date as HH:MM. */
export function formatTime(d: Date): string {
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function clampDay(year: number, monthZero: number, day: number): Date {
	// Build a Date then check if month rolled over due to day overflow.
	const d = new Date(Date.UTC(year, monthZero, day, 0, 0, 0));
	// If the month slid forward (e.g. Feb 30 → Mar 2), clamp to last day of target month.
	if (d.getUTCMonth() !== ((monthZero % 12) + 12) % 12) {
		// Set to day 0 of month+1 = last day of original month.
		return new Date(Date.UTC(year, monthZero + 1, 0, 0, 0, 0));
	}
	return d;
}

function addYears(anchor: Date, years: number): Date {
	return clampDay(anchor.getUTCFullYear() + years, anchor.getUTCMonth(), anchor.getUTCDate());
}

function addMonths(anchor: Date, months: number): Date {
	return clampDay(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, anchor.getUTCDate());
}

function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

/**
 * Resolve a bound expression to a concrete Date + string form suitable for
 * native HTML inputs. Returns null on syntax errors.
 */
export function resolveDateBound(
	bound: string,
	context: DateBoundContext,
	now: Date = new Date(),
): ResolvedBound | null {
	const raw = bound.trim();
	if (!raw) return null;

	if (context === "time") {
		const m = raw.match(TIME_24H);
		if (!m) return null;
		const hh = Number(m[1]);
		const mm = Number(m[2]);
		const d = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0),
		);
		return { date: d, iso: `${m[1]}:${m[2]}` };
	}

	// Absolute datetime — valid for both date and datetime contexts.
	const dt = raw.match(DATETIME_ISO);
	if (dt) {
		const y = Number(dt[1]);
		const mo = Number(dt[2]) - 1;
		const d = Number(dt[3]);
		const hh = Number(dt[4]);
		const mm = Number(dt[5]);
		const date = new Date(Date.UTC(y, mo, d, hh, mm, 0));
		return {
			date,
			iso: context === "datetime" ? formatIsoDatetime(date) : formatIsoDate(date),
		};
	}

	// Absolute date.
	const ds = raw.match(DATE_ISO);
	if (ds) {
		const y = Number(ds[1]);
		const mo = Number(ds[2]) - 1;
		const d = Number(ds[3]);
		const date = new Date(Date.UTC(y, mo, d, 0, 0, 0));
		return {
			date,
			iso: context === "datetime" ? formatIsoDatetime(date) : formatIsoDate(date),
		};
	}

	// Anchors alone.
	if (raw === "today") {
		const date = startOfUtcDay(now);
		return {
			date,
			iso: context === "datetime" ? formatIsoDatetime(date) : formatIsoDate(date),
		};
	}
	if (raw === "now") {
		// Trim to minute precision for datetime-local compatibility.
		const date = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate(),
				now.getUTCHours(),
				now.getUTCMinutes(),
				0,
			),
		);
		return {
			date,
			iso: context === "datetime" ? formatIsoDatetime(date) : formatIsoDate(date),
		};
	}

	// Relative expressions.
	const rel = raw.match(RELATIVE);
	if (rel) {
		const anchorName = (rel[1] ?? "today").toLowerCase() as "today" | "now";
		const sign = rel[2] === "-" ? -1 : 1;
		const n = Number(rel[3]) * sign;
		const unit = (rel[4] ?? "").toLowerCase();

		let anchor: Date;
		if (anchorName === "now") {
			anchor = new Date(
				Date.UTC(
					now.getUTCFullYear(),
					now.getUTCMonth(),
					now.getUTCDate(),
					now.getUTCHours(),
					now.getUTCMinutes(),
					0,
				),
			);
		} else {
			anchor = startOfUtcDay(now);
		}

		let result: Date;
		if (unit === "d") {
			result = new Date(anchor.getTime() + n * 86400_000);
		} else if (unit === "w") {
			result = new Date(anchor.getTime() + n * 7 * 86400_000);
		} else if (unit === "y") {
			result = addYears(anchor, n);
		} else if (unit === "m") {
			// `now+Nm` → minutes; `today+Nm` → months.
			result =
				anchorName === "now" ? new Date(anchor.getTime() + n * 60_000) : addMonths(anchor, n);
		} else {
			return null;
		}

		return {
			date: result,
			iso: context === "datetime" ? formatIsoDatetime(result) : formatIsoDate(result),
		};
	}

	return null;
}

/**
 * Compare two ISO strings (YYYY-MM-DD or YYYY-MM-DDTHH:MM or HH:MM). Returns
 * -1, 0, or 1. String comparison works because the formats are lexicographically
 * orderable.
 */
export function compareIso(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
