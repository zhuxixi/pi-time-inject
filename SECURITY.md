# Security Policy

## Reporting a Vulnerability

If you find a security issue in pi-time-inject, please report it
privately instead of opening a public issue:

- **Email:** <zhuzhenxi_555@hotmail.com> — put `pi-time-inject security`
  in the subject line.

Please include a description of the issue, affected versions, and (if
possible) steps to reproduce. I will acknowledge your report within 7
days and aim to publish a fix within 30 days of confirmation.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Scope

The extension transforms the messages array on pi's `context` event
(per-request only, never persisted to the session file). Security
concerns would primarily be: logic in `lib/inject-stamp.ts`
(malformed-message isolation, unknown content shapes), or the
rate-limited logging in `index.ts` (log-spam). When reporting, please
note which area is involved.
