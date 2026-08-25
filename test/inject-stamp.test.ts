/**
 * Cases for stampUserMessages() and formatTimestamp() — issue #3.
 *
 * Run with (no test framework — zero-dep, bundled by esbuild):
 *   npx esbuild test/inject-stamp.test.ts --bundle --format=esm \
 *     --platform=node --outfile=/tmp/inject-stamp-test.mjs && node /tmp/inject-stamp-test.mjs
 */
import { formatTimestamp, stampUserMessages } from "../lib/inject-stamp";

const STAMP = "[消息提交时间 2026-08-15 Saturday 22:00:00 GMT+8 —— 以最新一条为当前时间]";

interface AgentMsg {
	role: string;
	content?: unknown;
	timestamp?: number;
}

const user = (content: unknown, timestamp = 1): AgentMsg => ({ role: "user", content, timestamp });
const asst = (text: string): AgentMsg => ({ role: "assistant", content: [{ type: "text", text }] });
const tool = (): AgentMsg => ({ role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "out" }] });

let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
	if (cond) {
		console.log(`ok   ${name}`);
	} else {
		failed++;
		console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

const allStamp = (): string => STAMP;

// --- no user messages -> same reference ---
{
	const src = [asst("hi"), tool()];
	const result = stampUserMessages(src, allStamp);
	check("no user: returns same reference", result.messages === src);
	check("no user: stamped 0", result.stamped === 0);
	check("no user: total 0", result.total === 0);
}

// --- empty array -> same reference ---
{
	const src: AgentMsg[] = [];
	const result = stampUserMessages(src, allStamp);
	check("empty: returns same reference", result.messages === src);
	check("empty: stamped 0, total 0", result.stamped === 0 && result.total === 0);
}

// --- string content: stamps every user, skips non-user roles ---
{
	const src = [user("a", 1), asst("b"), user("c", 2), tool()];
	const result = stampUserMessages(src, allStamp);
	const out = result.messages;
	check("string: returns new array", out !== src);
	check("string: user 0 stamped", (out[0].content as string) === `a\n\n${STAMP}`);
	check("string: assistant untouched by identity", out[1] === src[1]);
	check("string: user 2 stamped", (out[2].content as string) === `c\n\n${STAMP}`);
	check("string: tool untouched by identity", out[3] === src[3]);
	check("string: original messages not mutated", (src[0].content as string) === "a" && (src[2].content as string) === "c");
	check("string: new message objects (no mutation)", out[0] !== src[0] && out[2] !== src[2]);
	check("string: stamped 2, total 2", result.stamped === 2 && result.total === 2);
}

// --- blocks content: append one text block, originals by identity ---
{
	const img = { type: "image", data: "abc", mimeType: "image/png" };
	const src = [user([{ type: "text", text: "look" }, img], 200)];
	const result = stampUserMessages(src, allStamp);
	const blocks = result.messages[0].content as Array<{ type: string; text?: string }>;
	check("blocks: same count +1", blocks.length === 3);
	check("blocks: originals by identity", blocks[0] === (src[0].content as unknown[])[0] && blocks[1] === (src[0].content as unknown[])[1]);
	check("blocks: stamp block appended", blocks[2].type === "text" && blocks[2].text === `\n\n${STAMP}`);
	check("blocks: original not mutated", (src[0].content as unknown[]).length === 2);
	check("blocks: stamped 1, total 1", result.stamped === 1 && result.total === 1);
}

// --- getStamp returning undefined for a user message -> skipped, counted ---
{
	const src = [user("skip-me", 1), user("stamp-me", 2)];
	const result = stampUserMessages(src, (m) => (m.timestamp === 1 ? undefined : STAMP));
	const out = result.messages;
	check("getStamp undefined: skipped message by identity", out[0] === src[0]);
	check("getStamp undefined: other message stamped", (out[1].content as string) === `stamp-me\n\n${STAMP}`);
	check("getStamp undefined: still returns changed array", out !== src);
	check("getStamp undefined: stamped 1, total 2", result.stamped === 1 && result.total === 2);
}

// --- getStamp undefined for ALL user messages -> same reference, total counted ---
{
	const src = [user("a", 1), user("b", 2)];
	const result = stampUserMessages(src, () => undefined);
	check("getStamp all undefined: returns same reference", result.messages === src);
	check("getStamp all undefined: stamped 0, total 2", result.stamped === 0 && result.total === 2);
}

// --- getStamp throws for one message -> that message isolated, others stamped ---
{
	const src = [user("bad", 1), user("good", 2)];
	const result = stampUserMessages(src, (m) => {
		if (m.timestamp === 1) throw new RangeError("Invalid time value");
		return STAMP;
	});
	check("throw: bad message untouched by identity", result.messages[0] === src[0]);
	check("throw: good message stamped", (result.messages[1].content as string) === `good\n\n${STAMP}`);
	check("throw: stamped 1, total 2", result.stamped === 1 && result.total === 2);
}

// --- getStamp throws for the ONLY user message -> same reference, counted ---
{
	const src = [user("only-bad", 1), asst("x")];
	const result = stampUserMessages(src, () => {
		throw new RangeError("Invalid time value");
	});
	check("throw only: returns same reference", result.messages === src);
	check("throw only: stamped 0, total 1", result.stamped === 0 && result.total === 1);
}

// --- unknown content shape -> skipped counted in total, message by identity ---
{
	const weird = user(42 as unknown, 900);
	const normal = user("fine", 901);
	const src = [weird, normal];
	const result = stampUserMessages(src, allStamp);
	check("unknown shape: message by identity", result.messages[0] === weird);
	check("unknown shape: normal message still stamped", (result.messages[1].content as string) === `fine\n\n${STAMP}`);
	check("unknown shape: returns changed array (other changed)", result.messages !== src);
	check("unknown shape: stamped 1, total 2", result.stamped === 1 && result.total === 2);
}

// --- mixed: 1 unknown-shape + 1 getStamp-throw + 1 normal ---
{
	const weird = user(42 as unknown, 10);
	const thrower = user("throw", 20);
	const normal = user("ok", 30);
	const src = [weird, thrower, normal];
	const result = stampUserMessages(src, (m) => {
		if (m.timestamp === 20) throw new RangeError("Invalid time value");
		return STAMP;
	});
	check("mixed: weird by identity", result.messages[0] === weird);
	check("mixed: thrower by identity", result.messages[1] === thrower);
	check("mixed: normal stamped", (result.messages[2].content as string) === `ok\n\n${STAMP}`);
	check("mixed: stamped 1, total 3", result.stamped === 1 && result.total === 3);
}

// --- empty string content ---
{
	const result = stampUserMessages([user("", 300)], allStamp);
	check("empty string: still appends", (result.messages[0].content as string) === `\n\n${STAMP}`);
	check("empty string: stamped 1, total 1", result.stamped === 1 && result.total === 1);
}

// --- multiple user messages each get their own stamp (fake getter keyed by timestamp) ---
{
	const stamps = new Map<number, string>([
		[10, "stamp-10"],
		[20, "stamp-20"],
	]);
	const src = [user("m1", 10), asst("x"), user("m2", 20)];
	const result = stampUserMessages(src, (m) => stamps.get(m.timestamp!));
	check("multi: m1 gets own stamp", (result.messages[0].content as string) === `m1\n\nstamp-10`);
	check("multi: m2 gets own stamp", (result.messages[2].content as string) === `m2\n\nstamp-20`);
	check("multi: assistant untouched by identity", result.messages[1] === src[1]);
	check("multi: stamped 2, total 2", result.stamped === 2 && result.total === 2);
}

// --- formatTimestamp: pure determinism (same epoch -> same string) ---
{
	const epoch = Date.UTC(2026, 7, 15, 14, 0, 0); // 2026-08-15 14:00:00 UTC
	const a = formatTimestamp(epoch);
	const b = formatTimestamp(epoch);
	check("formatTimestamp: same epoch identical", a === b);
	check("formatTimestamp: different epochs differ", a !== formatTimestamp(epoch + 1000));
	// TZ char class allows colon so short names like GMT+5:30 match (issue-15).
	const re = /^\[消息提交时间 \d{4}-\d{2}-\d{2} (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{2}:\d{2}:\d{2} [A-Za-z0-9+:-]+ —— 以最新一条为当前时间\]$/;
	check("formatTimestamp: format matches CC shape", re.test(a), a);
}

// --- deterministic getter: cross-request byte-stability over a long history ---
// Regression guard for the round-1 Map cap-200 eviction cascade: with 201+
// live user messages the old FIFO eviction regenerated every stamp on every
// request. Deterministic derivation must keep both outputs byte-identical.
{
	const n = 210;
	const src: AgentMsg[] = [];
	for (let i = 0; i < n; i++) {
		src.push(user(`u${i}`, 1_000_000_000 + i * 1000));
	}
	const get = (m: AgentMsg): string | undefined =>
		typeof m.timestamp === "number" ? formatTimestamp(m.timestamp) : undefined;
	const out1 = stampUserMessages(src, get);
	const out2 = stampUserMessages(src, get);
	check("long history: first run stamped", (out1.messages[0].content as string).includes("[消息提交时间"));
	check("long history: last run stamped", (out1.messages[n - 1].content as string).includes("[消息提交时间"));
	check("long history: stamped all 210", out1.stamped === 210 && out1.total === 210);
	check("long history: second run byte-identical", JSON.stringify(out1.messages) === JSON.stringify(out2.messages));
	// spot-check the deterministic getter maps each message to its own epoch-derived stamp
	check("long history: per-message stamp differs by epoch",
		(out1.messages[0].content as string) !== (out1.messages[1].content as string));
}

// --- non-number timestamp -> message untouched, no stamp, counted as skip ---
{
	const bad = user("no-ts", "not-a-number" as unknown as number);
	const good = user("has-ts", 1234567890);
	const src = [bad, good];
	const result = stampUserMessages(src, (m) =>
		typeof m.timestamp === "number" && Number.isFinite(m.timestamp)
			? formatTimestamp(m.timestamp)
			: undefined,
	);
	check("non-number ts: untouched by identity", result.messages[0] === bad);
	check("non-number ts: good message stamped", (result.messages[1].content as string).includes("[消息提交时间"));
	check("non-number ts: stamped 1, total 2", result.stamped === 1 && result.total === 2);
}

if (failed) {
	console.error(`\n${failed} cases FAILED`);
	process.exit(1);
}
console.log("\nall cases passed");
