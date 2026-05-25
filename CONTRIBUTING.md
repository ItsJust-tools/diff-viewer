# Contributing to itsjust

Thanks for your interest in contributing! This document covers the basics.

## Development Setup

```bash
git clone https://github.com/ItsJust-tools/template.git
cd template
npm install
```

## Branching Strategy

- `main` — production-ready code
- Feature branches: `feat/short-description`
- Bugfix branches: `fix/short-description`

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `test:` — adding or updating tests
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `chore:` — build process or auxiliary tool changes

Example:

```text
feat: add svg export support

- register svg exporter in tool-definition.ts
- add svg format to ExportFormat union
```

## Testing

All changes must include tests. We use Vitest for unit tests and Playwright for E2E.

```bash
# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Run with coverage
npm test -- --coverage
```

### Coverage Requirements

- `packages/core/src`: minimum 85% coverage (lines, functions, branches, statements)
- `src/`: minimum 70% coverage

Run `npm test -- --coverage` to see the per-package breakdown.

### Snapshot Stability

Visual regression tests use Playwright screenshots. To keep snapshots stable:

- Run snapshots in the **same OS and browser** as CI (Ubuntu + Chromium)
- Avoid animations in test paths or wait for them to finish
- Use deterministic data (fixed dates, seeded randomness)
- Update baselines with `npm run test:e2e -- --update-snapshots` only when UI intentionally changes

### Writing Tests

- Mock external APIs (localStorage, navigator.share, URL.createObjectURL).
- Test error paths, not just happy paths.
- Use `@testing-library/react` for component tests.
- Wrap components that use `useToast` in `<ToastProvider>`.
- Mock `console.error`/`console.warn` in tests that trigger expected errors to keep stderr clean.

## Code Style

- No `eslint-disable` for `react-hooks/exhaustive-deps` without a detailed comment explaining why.
- Prefer `useCallback` over inline functions passed as props.
- Keep components focused — one component, one responsibility.
- Add `displayName` to all exported components.

## AI-Assisted Contributions

- AI-generated changes must follow project philosophy strictly:
  - single-purpose UX (no feature bloat),
  - privacy-first/client-only defaults,
  - accessibility as a hard requirement.
- AI-generated changes must not silently mutate template baseline data/contracts to hide upstream template defects.
- If an AI suggestion conflicts with these principles, contributors must reject or revise it before merge.
- If an issue is template-level, call it out explicitly and track it as a template update requirement.
- AI-assisted PRs must include:
  - tests for behavioral changes,
  - documentation updates for user-visible changes,
  - `CHANGELOG.md` updates under `[Unreleased]`.

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes with tests.
3. Ensure `npm run build` and `npm test` pass.
4. Update `CHANGELOG.md` under `[Unreleased]`.
5. Open a PR with a clear description of the change and motivation.

## Reporting Issues

Use GitHub Issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Browser and OS version
- Screenshots if applicable
