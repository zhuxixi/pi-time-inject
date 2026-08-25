# pi-time-inject

[![npm version](https://img.shields.io/npm/v/@zhuxixi/pi-time-inject)](https://www.npmjs.com/package/@zhuxixi/pi-time-inject)
[![license](https://img.shields.io/github/license/zhuxixi/pi-time-inject)](./LICENSE)
[![pi package](https://img.shields.io/badge/pi-package-181717?logo=github)](https://pi.dev/packages)

Time injection for [pi](https://github.com/earendil-works/pi-coding-agent):
stamps every user message with the **real current time**, so the model
always sees an accurate "now". This is a port of the Claude Code
`UserPromptSubmit` `date` hook — needed because third-party models like
GLM/DeepSeek have no built-in clock, and a missing date once caused a
calver week miscalculation.

```text
[消息提交时间 2026-08-25 Tuesday 08:32:44 GMT+8 —— 以最新一条为当前时间]
```

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- **Per-message stamps, never a global "now"**: each user message's
  stamp is derived from its own creation `timestamp` (epoch ms), so a
  message carries the identical stamp on every request — within a tool
  loop, across turns, across restarts, and for unbounded history.
  Deterministic and stateless: no mutable state, no concurrency issues.
- **Prefix-cache friendly**: the stamp is appended to the END of user
  messages, never to the system prompt. DeepSeek-style context caches
  match requests byte-for-byte from token 0 — a per-turn stamp in the
  system prompt would break the match and re-bill the ENTIRE history at
  full price every turn. With user-message appends, the changing part
  sits at the very end of the sequence and the system prompt + history
  stay cache-hit.
- **Session stays clean**: the `context` event transforms are
  request-time only — the session file, `/undo`, exports and other
  extensions never see the stamp.
- **No input-transform pollution**: rewriting user text in the `input`
  event would leak the stamp into other extensions' prompt capture
  (e.g. notify extensions), so the stamp is applied in `context`
  instead.
- **Fail-open**: any failure logs rate-limited (max one line per 5
  minutes per channel) and returns the original messages untouched.
  Never throws, never blocks the agent loop. A single malformed message
  isolates itself — it skips only itself, the rest still get stamps.

## Requirements

- **pi ≥ 0.84** (uses the `context` event). No other dependencies.

## Installation

### From npm (recommended)

```bash
pi install npm:@zhuxixi/pi-time-inject
```

Then run `/reload` in pi (no restart needed).

To update later:

```bash
pi update --extensions
```

To remove:

```bash
pi remove npm:@zhuxixi/pi-time-inject
```

### From source

Clone the repository into a subdirectory of pi's global extensions dir:

```bash
git clone https://github.com/zhuxixi/pi-time-inject.git ~/.pi/agent/extensions/pi-time-inject
```

## How It Works

1. On the `context` event (fires before every LLM call with a
   structured-clone'd messages array), the extension walks the user
   messages and appends a stamp line to each.
2. The stamp wording is position-neutral and byte-identical for every
   message — `[消息提交时间 YYYY-MM-DD Weekday HH:MM:SS TZ —— 以最新一条为当前时间]` —
   so a message's stamp never changes as it ages from latest to
   history (that would break the cache prefix at that message).
3. The timezone abbreviation comes from `Intl.DateTimeFormat` (may
   render as `GMT+8` rather than Claude Code's `CST`) — equally
   unambiguous to the model, and avoids forking a `date` subprocess per
   prompt.
4. Failures are rate-limited-logged per channel (error vs skip) and
   never thrown. The skip channel reports `stamped X/Y user messages`
   when any user message is skipped.

No configuration, no commands, no state files — it just works.

## Development

```bash
./test/run-all.sh   # bundles test/*.test.ts with esbuild and runs them
```

Tests are dependency-free: `lib/inject-stamp.ts` is pure and tested
directly, `index.ts` (the handler layer) is tested through a minimal
`ExtensionAPI` stub covering the catch contract, return shapes and
rate-limited logging.

After editing, run `/reload` inside pi to hot-reload the extension.

## Troubleshooting

- **No stamps appear**: check that the extension is listed in
  `pi config`; after install you must `/reload` (or restart) pi for the
  extension to load.
- **Some messages lack stamps**: a malformed message (non-number
  timestamp, unknown content shape) skips only itself — check stderr
  for a rate-limited `[time-inject] stamped X/Y user messages` line.
- **Stamp timezone looks wrong**: the abbreviation comes from the
  system locale's `Intl` data; the epoch itself is the message's own
  creation time, which is what matters for correctness.

## License

[MIT](./LICENSE)
