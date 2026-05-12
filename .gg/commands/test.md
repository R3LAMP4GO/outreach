---
name: test
description: Run tests, then spawn parallel agents to fix failures
---

Run all tests, collect failures, and spawn parallel sub-agents to fix them.

## Step 1: Run Tests

```bash
# Run all tests
bun run test:run

# With coverage report
bun run test:coverage

# Run specific test file
bun run test:run -- lib/__tests__/encryption.test.ts

# Run tests matching a pattern
bun run test:run -- -t "password"

# Watch mode (interactive development)
bun run test

# Visual UI
bun run test:ui
```

## Step 2: If Failures

Parse the output. Group failures by domain:
- **Unit test failures** — issues in `lib/**/__tests__/`
- **Integration test failures** — issues in `app/api/**/__tests__/`
- **Security test failures** — issues in `app/__tests__/security/`

For each domain with failures, use the subagent tool to spawn a sub-agent. The agent should:
1. Read the failing test file AND the source file it tests
2. Determine if the bug is in the source code or the test
3. Fix the SOURCE code if the test is correct, or fix the TEST if the source is correct
4. Run the specific test file to verify: `bun run test:run -- <path-to-test-file>`

Spawn agents in parallel — one per domain with failures.

## Step 3: Re-run

After all agents complete, re-run the full suite:

```bash
bun run test:run
```

All tests must pass. If failures remain, repeat Step 2.
