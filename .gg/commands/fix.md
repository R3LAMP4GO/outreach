---
name: fix
description: Run all checks including a full production build, then spawn parallel sub-agents to fix all issues
---

Run all checks, collect every error, and fix everything before any code is committed.

## Step 1: Run all checks

Run each command and capture full output. Do NOT stop on failure — collect all errors first.

```bash
set +e
set -o pipefail

# Lint
bun run lint 2>&1 | tee /tmp/lint-output.txt
echo "EXIT:${PIPESTATUS[0]}" >> /tmp/lint-output.txt

# Type check
bun run typecheck 2>&1 | tee /tmp/typecheck-output.txt
echo "EXIT:${PIPESTATUS[0]}" >> /tmp/typecheck-output.txt

# Dead-code check (required)
bun run knip 2>&1 | tee /tmp/knip-output.txt
echo "EXIT:${PIPESTATUS[0]}" >> /tmp/knip-output.txt

# Unit tests (project uses test:run)
bun run test:run 2>&1 | tee /tmp/test-output.txt
echo "EXIT:${PIPESTATUS[0]}" >> /tmp/test-output.txt
```

Then run a full production build (most important check):

```bash
rm -rf .next
bun run build 2>&1 | tee /tmp/build-output.txt
echo "EXIT:${PIPESTATUS[0]}" >> /tmp/build-output.txt
```

> **Why the full build is required:**
> - Typecheck alone can miss issues a fresh build catches
> - Build traces all imports and catches missing modules/transitive dependency breakage
> - Build runs static generation and catches dynamic API usage on static routes

## Step 2: Collect and group errors

Parse outputs and group failures by domain:

- **Build errors** — module resolution, compile failures, static generation errors
- **Type errors** — TypeScript compiler errors (`TS####`)
- **Lint errors** — ESLint violations
- **Dead code** — knip issues
- **Test failures** — failing unit tests

If all checks pass cleanly, report success and stop.

## Step 3: Spawn parallel sub-agents

For each failing domain, spawn one sub-agent with:

- Exact error output
- File paths and line numbers
- Instruction to fix **all** issues in that domain
- Instruction to re-run the relevant check to verify after fixing

Run all domain agents simultaneously and wait for all to complete.

### Sub-agent prompt templates

**Build errors**
```text
Fix all build errors in /Users/jakeschepis/GitHub/website.

Errors:
[PASTE FULL build output]

Requirements:
1. Read each file before editing.
2. Fix root causes (missing deps, bad imports, static/dynamic page mismatches, config issues).
3. Keep fixes minimal and aligned with project patterns.
4. Run `rm -rf .next && bun run build` and confirm success.
```

**Type errors**
```text
Fix all TypeScript type errors in /Users/jakeschepis/GitHub/website.

Errors:
[PASTE FULL typecheck output]

Requirements:
1. Read each file before editing.
2. Use proper types — avoid `any` unless absolutely necessary.
3. Skip generated files.
4. Run `bun run typecheck` and confirm zero errors.
```

**Lint errors**
```text
Fix all ESLint errors in /Users/jakeschepis/GitHub/website.

Errors:
[PASTE FULL lint output]

Requirements:
1. Read each file before editing.
2. Fix by rule intent.
3. Do not add eslint-disable comments unless truly required.
4. Run `bun run lint` and confirm success.
```

**Dead code (knip)**
```text
Fix all knip issues in /Users/jakeschepis/GitHub/website.

Errors:
[PASTE FULL knip output]

Requirements:
1. Remove or wire unused code/deps safely.
2. Do not break runtime behavior.
3. Run `bun run knip` and confirm success.
```

**Test failures**
```text
Fix all unit test failures in /Users/jakeschepis/GitHub/website.

Errors:
[PASTE FULL test output]

Requirements:
1. Fix implementation or tests based on intended behavior.
2. Avoid weakening assertions just to pass.
3. Run `bun run test:run` and confirm success.
```

## Step 4: Verify everything is fixed

Re-run full suite:

```bash
bun run lint && bun run typecheck && bun run knip && bun run test:run
rm -rf .next && bun run build
```

All must pass with exit code 0. If any fail, return to Step 3.

## Step 5: Handoff

When clean, report:
- Which domains failed initially
- Which files were changed
- Final check results

Commit/push is handled separately via `/commit`.
