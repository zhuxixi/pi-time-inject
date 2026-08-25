/**
 * Pure helpers for time-inject (issue #3): derive a per-message timestamp
 * stamp from a message's own creation epoch and append it to every user
 * message in an AgentMessage array.
 *
 * Request-time only — the caller applies these to the `context` event's
 * structured-clone'd messages; results never persist into the session file.
 * Minimal structural types keep this file dependency-free (esbuild-bundleable).
 */

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/** Shared formatter: depends only on locale/options, not on the epoch argument —
 * `formatToParts(date)` takes the date as a parameter, so a module-level
 * singleton is deterministic (same epoch -> same string, process-local TZ) and
 * avoids reconstructing Intl's locale data per message per request. */
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" });

/**
 * Format an epoch-ms timestamp as a position-neutral stamp line
 * `[消息提交时间 YYYY-MM-DD Weekday HH:MM:SS TZ —— 以最新一条为当前时间]`.
 * The wording is byte-identical for every message (history and latest alike)
 * so a message's stamp never changes as it ages from latest to history — that
 * would break the cache prefix at that message.
 * Pure: same epoch -> same string (process-local TZ). The timezone abbreviation
 * comes from Intl: may render as "GMT+8" rather than CC's "CST" — equally
 * unambiguous to the model, and avoids forking a `date` subprocess per prompt.
 */
export function formatTimestamp(epochMs: number): string {
	const now = new Date(epochMs);
	const pad = (n: number): string => String(n).padStart(2, "0");
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const weekday = WEEKDAYS[now.getDay()];
	const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
	const tz =
		TIME_FORMATTER.formatToParts(now)
			.find((p) => p.type === "timeZoneName")?.value ?? "";
	return `[消息提交时间 ${date} ${weekday} ${time} ${tz} —— 以最新一条为当前时间]`;
}

/** Minimal structural subset of pi's AgentMessage used by these helpers. */
export interface AgentMsg {
	role: string;
	content?: unknown;
	timestamp?: number;
}

/** Outcome of stampUserMessages: the (possibly new) messages array plus
 * user-message accounting so the caller can log partial/complete skips. */
export interface StampResult {
	messages: AgentMsg[];
	/** User messages successfully stamped. */
	stamped: number;
	/** Total user messages seen (stamped + skipped). */
	total: number;
}

/**
 * Stamp each user message's content via `getStamp(msg)` (a `"\n\n" + stamp`
 * append: string -> concatenated, blocks -> one extra text block). Messages
 * skipped by getStamp (undefined), with an unknown content shape, or whose
 * getStamp call throws pass through untouched — never silently replaced. One
 * malformed message is isolated: it skips only itself, never the whole batch.
 * Never mutates the input; `result.messages` is the input reference when
 * nothing changed.
 */
export function stampUserMessages(
	messages: readonly AgentMsg[],
	getStamp: (msg: AgentMsg) => string | undefined,
): StampResult {
	const out = messages.slice();
	let stamped = 0;
	let total = 0;
	for (let i = 0; i < out.length; i++) {
		const msg = out[i];
		if (msg.role !== "user") continue;
		total++;
		const stamp = (() => {
			try {
				return getStamp(msg);
			} catch {
				// One malformed message (e.g. a finite-but-out-of-Date-range
				// timestamp that makes Intl throw RangeError) must not poison
				// the whole batch: skip only this message.
				return undefined;
			}
		})();
		if (stamp === undefined) continue;
		const suffix = `\n\n${stamp}`;
		let next: AgentMsg | undefined;
		if (typeof msg.content === "string") {
			next = { ...msg, content: msg.content + suffix };
		} else if (Array.isArray(msg.content)) {
			next = { ...msg, content: [...msg.content, { type: "text", text: suffix }] };
		} else {
			// Unknown content shape: do NOT touch (conservative) — appending
			// would risk silently dropping the original message body.
			continue;
		}
		out[i] = next;
		stamped++;
	}
	return { messages: stamped > 0 ? out : (messages as AgentMsg[]), stamped, total };
}
