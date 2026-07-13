# ADR 0001: Agent Light local hook bridge

- Status: Proposed
- Date: 2026-07-13

## Context

Agent Light must present one native macOS status and permission surface for Claude Code, Codex, Cursor, OpenCode, and Hermes without depending on a running editor extension. The supported agents expose different hook and plugin protocols, while permission answers must be returned to the exact request that opened the prompt. Hook failures must not prevent an agent from continuing when Agent Light is closed.

## Decision

The standalone Electron app owns a loopback-only HTTP/SSE hub authenticated by a random bearer token. It writes the endpoint and token to a mode-`0600` connection file under the app's user-data directory.

Provider-specific adapters translate official hook or plugin events into the versioned `agent-light/1` contract. Permission requests include a provider, session ID, and request ID; replies are accepted only for the currently waiting request and are consumed once. Adapters fail open if the app is unavailable or a wait times out.

The installer merges Agent Light entries into each provider's user configuration without replacing unrelated settings. Packaged hook commands use the Electron executable shipped inside `Agent Light.app` with `ELECTRON_RUN_AS_NODE=1`, so users do not need a separate Node.js installation.

The app remains a small always-on-top liquid-glass window and preserves the existing terminal-monitoring extension as a separate entry point sharing the same visual language.

## Consequences

- Agent traffic and approval decisions stay on the local machine and the hub is not exposed beyond loopback.
- Request-scoped, single-consumption replies prevent stale approvals from authorizing a later request.
- Every provider needs a maintained translation adapter as its official hook schema evolves.
- User configuration changes remain visible and reversible, but providers that require hook trust or approval still require their normal first-run confirmation.
- Distribution is self-contained but inherits Electron's application and DMG size.

## Alternatives considered

- Poll provider log files: rejected because permissions cannot be answered reliably and log formats are not stable integration contracts.
- Bundle each agent CLI: rejected because it would duplicate provider installations and credentials.
- Run a network-accessible daemon: rejected because it expands the security boundary without improving the local desktop workflow.
