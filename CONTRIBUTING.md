# Contributing

## Before changing code

- Read `AGENTS.md` and `CONTEXT.md` before touching startup, sync, transaction order, navigation, or modal ownership.
- Preserve the Google Sheets names, legacy headers, exact transaction types, local-first behavior, and incremental OAuth scopes.
- Keep changes small. Do not introduce a state layer, backend, test framework, or native dependency without measured need.

Install dependencies and enable the tracked hook:

```powershell
npm ci
npm run hooks:install
```

## Required validation

Run before every commit and pull request:

```powershell
npm run ci
```

The pre-commit hook runs the same command. GitHub Actions repeats it on every push and pull request.

Changes to calculations, parsing, filtering, sorting, persistence, synchronization, or Google requests require behavior tests. Bug fixes require a regression test that demonstrates the failure before the fix. Visual-only changes still require type and CI validation plus a real-device check when interaction, layout, keyboard, animation, or native modules are involved.

## Pull requests and commits

- Use Conventional Commits.
- Use hyphen bullets in multi-line commit bodies.
- Explain user-visible risk and validation performed.
- Do not include `.env`, credentials, spreadsheet IDs, logs, build output, `.expo`, or `node_modules`.
- Do not submit skipped tests or lower coverage thresholds merely to make CI pass.
