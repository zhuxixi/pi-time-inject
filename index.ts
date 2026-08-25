/**
 * Time Inject Extension for pi
 *
 * Port of the Claude Code UserPromptSubmit `date` hook: make sure the model
 * always sees the real current time (3rd-party models like GLM/DeepSeek have
 * no built-in "now"; a missing date caused a calver week miscalculation before).
 *
 * Output format (position-neutral, identical for every message):
 * [消息提交时间 YYYY-MM-DD Weekday HH:MM:SS TZ —— 以最新一条为当前时间]
 *
 * Injection point: the `context` event (fires before every LLM call with a
 * structured-clone'd messages array). We append a stamp to the END of each
 * user message — never to the system prompt. Why (issue #3):
 *
 *   1. Prefix cache. DeepSeek-style context caches match requests byte-for-
 *      byte from token 0. A per-turn stamp at the end of the system prompt
 *      broke the match there, re-billing the ENTIRE conversation history at
 *      full price every turn (~10x input cost at 60K ctx). Appended to the
 *      user messages instead, the changing part sits at the very end of the
 *      sequence: system prompt + full history stay cache-hit.
 *   2. Session stays clean. `context` transforms are request-time only — the
 *      session file, /undo, exports and other extensions never see the stamp.
 *   3. No input-transform pollution. The `input` event chains transforms
 *      across extensions in non-deterministic load order (readdirSync order);
 *      rewriting user text there would leak the stamp into pushover-notify's
 *      prompt capture, dedupe and notifications, and break /skill expansion.
 *
 * Stamp stability — deterministic, stateless: each user message's stamp is
 * derived from its OWN creation `timestamp` field (epoch ms), so the stamp is
 * permanently "the moment this prompt was asked". A message therefore carries
 * the exact same stamp on every request — within a tool loop, across turns,
 * across processes, across restarts, and for unbounded history — with no
 * mutable state and no concurrency concerns. Non-number / non-finite
 * timestamps are skipped; a single malformed message isolates itself (its
 * stamp is skipped, others still get theirs). Failures and skip counts are
 * rate-limited-logged per channel (error vs skip) and never thrown — the
 * skip channel reports `stamped X/Y user messages` when any user message is
 * skipped.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatTimestamp, stampUserMessages, type AgentMsg } from "./lib/inject-stamp";

/** Rate-limited log: at most one line per channel per interval; keeps the
 * fail-open contract (never throw) while making persistent degradation
 * discoverable. Separate channels so a continuously-triggering warn (skip)
 * cannot starve a one-off error. */
const LOG_MIN_INTERVAL_MS = 5 * 60 * 1000;
const lastLogAt: Record<string, number> = {};
function logRateLimited(channel: string, line: string, err?: unknown): void {
	const now = Date.now();
	const prev = lastLogAt[channel] ?? 0;
	if (now - prev >= LOG_MIN_INTERVAL_MS) {
		lastLogAt[channel] = now;
		if (err !== undefined) console.error(line, err);
		else console.error(line);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("context", (event) => {
		try {
			const messages = event.messages as AgentMsg[];
			const result = stampUserMessages(messages, (msg) =>
				typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
					? formatTimestamp(msg.timestamp)
					: undefined);
			if (result.total > 0 && result.stamped < result.total) {
				logRateLimited("skip", `[time-inject] stamped ${result.stamped}/${result.total} user messages (bad timestamp or content shape?)`);
			}
			return { messages: result.messages };
		} catch (err) {
			logRateLimited("error", "[time-inject] stamp injection failed, continuing without it", err);
			// Any failure: return nothing -> original messages pass through unchanged.
			// Never throw, never block the agent loop.
			return undefined;
		}
	});
}
