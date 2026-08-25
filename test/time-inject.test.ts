/**
 * Handler-layer tests for index.ts — closes the P0 coverage gap that was
 * pi-personal-extensions issue #7: the `context`-event assembly contract
 * (catch contract, return shapes, rate-limited logging).
 *
 * IMPORTANT: the module-level rate-limit state (lastLogAt) is shared
 * across ALL cases — there is no reset hook, and the 5-minute window is
 * real wall-clock time. The suite is therefore one continuous timeline:
 * assertions use CUMULATIVE log counts, and each channel (error vs skip)
 * is first exercised by its FIRST trigger (proves delivery), then by a
 * repeat trigger (proves suppression).
 *
 * Run with (no test framework — zero-dep, bundled by esbuild):
 *   ./test/run-all.sh
 */
import timeInject from "../index";

/** Minimal structural stub of pi's ExtensionAPI — only what index.ts uses. */
interface Handler {
	(event: { messages: unknown }): unknown;
}
interface PiStub {
	handlers: Map<string, Handler>;
	on: (event: string, cb: Handler) => void;
}
function makePi(): PiStub {
	const handlers = new Map<string, Handler>();
	return {
		handlers,
		on(event, cb) {
			handlers.set(event, cb);
		},
	};
}

// console.error spy — NOTE: check() failures are printed via console.log
// so they are never swallowed by the spy.
const errorLines: unknown[][] = [];
const realError = console.error;
function spyError(): void {
	errorLines.length = 0;
	console.error = (...args: unknown[]) => {
		errorLines.push(args);
	};
}
function restoreError(): void {
	console.error = realError;
}

const user = (content: string, timestamp: number): Record<string, unknown> => ({
	role: "user",
	content,
	timestamp,
});
const asst = (): Record<string, unknown> => ({
	role: "assistant",
	content: [{ type: "text", text: "hi" }],
});
const badTs = (content: string): Record<string, unknown> => ({
	role: "user",
	content,
	timestamp: "not-a-number" as unknown as number,
});

let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
	if (cond) {
		console.log(`ok   ${name}`);
	} else {
		failed++;
		console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

const hasStamp = (msg: Record<string, unknown>): boolean =>
	typeof msg.content === "string" && msg.content.includes("[消息提交时间");

// ============================================================
// Timeline: one shared rate-limit state, cumulative assertions.
// ============================================================
spyError();
const pi = makePi();
timeInject(pi as unknown as Parameters<typeof timeInject>[0]);
const ctx = pi.handlers.get("context")!;

// --- registration ---
check("registers a context handler", pi.handlers.has("context"));

// --- T1: first skip-channel trigger (all user messages skipped) -> logs ---
{
	const messages = [badTs("a"), badTs("b")];
	const result = ctx({ messages }) as { messages: Record<string, unknown>[] };
	check("T1 all-skip: returns { messages }", typeof result === "object" && result !== null && "messages" in result);
	check("T1 all-skip: messages pass through untouched by identity", result.messages[0] === messages[0] && result.messages[1] === messages[1]);
	check("T1 all-skip: skip channel logs exactly once", errorLines.length === 1);
	check("T1 all-skip: log mentions stamped 0/2",
		typeof errorLines[0][0] === "string" && (errorLines[0][0] as string).includes("stamped 0/2"));
}

// --- T2: repeat skip trigger immediately after -> suppressed (rate limit) ---
{
	const messages = [badTs("a"), user("fine", 1_000_000_006)];
	const result = ctx({ messages }) as { messages: Record<string, unknown>[] };
	check("T2 partial-skip: bad untouched by identity", result.messages[0] === messages[0]);
	check("T2 partial-skip: good stamped", hasStamp(result.messages[1]));
	check("T2 partial-skip: skip channel still one line total (suppressed)", errorLines.length === 1);
}

// --- T3: full success -> no new log line ---
{
	const messages = [user("hello", 1_000_000_000), asst(), user("world", 1_000_000_002)];
	const result = ctx({ messages }) as { messages: Record<string, unknown>[] };
	check("T3 happy: every user stamped", hasStamp(result.messages[0]) && hasStamp(result.messages[2]));
	check("T3 happy: assistant untouched by identity", result.messages[1] === messages[1]);
	check("T3 happy: original array not mutated", !hasStamp(messages[0]));
	check("T3 happy: no new log line", errorLines.length === 1);
}

// --- T4: failure path (non-array messages) -> error channel, independent of skip ---
{
	let threw = false;
	let result: unknown;
	try {
		result = ctx({ messages: null });
	} catch {
		threw = true;
	}
	check("T4 throw path: never throws", !threw);
	check("T4 throw path: returns undefined", result === undefined);
	check("T4 throw path: error channel adds exactly one line", errorLines.length === 2);
	check("T4 throw path: error line mentions injection failed",
		typeof errorLines[1][0] === "string" && (errorLines[1][0] as string).includes("stamp injection failed"));
}

// --- T5: repeat failure -> suppressed (error rate limit) ---
{
	ctx({ messages: null });
	ctx({ messages: null });
	check("T5 error rate-limit: still exactly two lines total", errorLines.length === 2);
}

// --- T6: mixed channels still each rate-limited independently (cumulative) ---
{
	// error channel already logged (T4); skip channel already logged (T1);
	// a fresh skip trigger now must be suppressed, and a fresh error too.
	const result = ctx({ messages: [badTs("x"), user("ok", 1_000_000_008)] });
	check("T6 mixed: skip again suppressed (2 lines total)", errorLines.length === 2);
	check("T6 mixed: good still stamped", hasStamp((result as { messages: Record<string, unknown>[] }).messages[1]));
}
check("all log lines carry the [time-inject] prefix",
	errorLines.every((l) => typeof l[0] === "string" && (l[0] as string).includes("[time-inject]")));
check("all log lines are on stderr (console.error)", errorLines.length === 2 && errorLines.length === errorLines.filter(() => true).length);

restoreError();

if (failed) {
	console.log(`\n${failed} cases FAILED`);
	process.exit(1);
}
console.log("\nall cases passed");
