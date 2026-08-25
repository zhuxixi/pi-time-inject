# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-25

First public release — split out of `pi-personal-extensions` (was
`time-inject.ts`), published to npm as `@zhuxixi/pi-time-inject`.

### Added

- `context`-event time injection: every user message gets a
  deterministic, stateless stamp `[消息提交时间 YYYY-MM-DD Weekday HH:MM:SS TZ ——
  以最新一条为当前时间]` derived from the message's own creation epoch.
- Prefix-cache-friendly placement: stamp appended to user message ends,
  never the system prompt (DeepSeek-style byte-for-byte caches stay
  hit across turns).
- Fail-open contract with rate-limited logging (max one line per 5
  minutes per channel, error vs skip channels separated); never throws,
  never blocks the agent loop.
- `lib/inject-stamp.ts`: dependency-free pure helpers
  (`formatTimestamp`, `stampUserMessages`) with per-message isolation
  for malformed messages.
- Handler-layer unit tests (`test/time-inject.test.ts`) covering the
  catch contract, return shapes and rate-limit behavior — closes the
  P0 coverage gap previously tracked as pi-personal-extensions
  issue #7.
- Zero-dependency test runner (`test/run-all.sh`, esbuild + node).
- `package.json` pi manifest so the extension installs via
  `pi install npm:@zhuxixi/pi-time-inject`.
