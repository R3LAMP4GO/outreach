---
name: update
description: Update dependencies, fix deprecations and warnings
---

## Step 1: Check for Updates

Run `bun outdated` to see which dependencies have newer versions available. Review the output and note any major version bumps that may contain breaking changes.

## Step 2: Update Dependencies

Run `bun update` to update all dependencies within their semver ranges.

For packages that need major version bumps, update them individually:
```bash
bun add <package>@latest
```

Then run a security audit:
```bash
bun audit
```

If `bun audit` is not available, check npm's advisory database manually:
```bash
npx audit-ci --moderate
```

## Step 3: Check for Deprecations & Warnings

Run a clean install and read ALL output carefully:
```bash
rm -rf node_modules bun.lock
bun install
```

Look for:
- Deprecation warnings from any package
- Security vulnerability notices
- Peer dependency conflicts
- Breaking change notices
- Warnings about Node.js version compatibility

Capture and review the full output — don't skip any lines.

## Step 4: Fix Issues

For each warning or deprecation found:
1. Research the recommended replacement or fix (use `web_fetch` on the package's changelog/migration guide)
2. Update the dependency or code accordingly
3. Re-run `bun install`
4. Verify the specific warning is resolved before moving on

Common fixes:
- **Deprecated packages**: Find the recommended successor and migrate imports
- **Peer dependency warnings**: Add the required peer as a direct dependency or update the parent package
- **Security vulnerabilities**: Update to the patched version, or add to `overrides`/`resolutions` in package.json if a transitive dep

## Step 5: Run Quality Checks

Run all project quality checks and fix any errors introduced by updates:

```bash
bun run typecheck
bun run lint
bun run build
bun run test:run
```

If type errors appear after a major version bump, check the package's migration guide and update type usage accordingly.

Fix all errors before completing. Warnings that existed before the update can be ignored.

## Step 6: Verify Clean Install

Delete everything and do a final fresh install to confirm zero issues:

```bash
rm -rf node_modules .next bun.lock
bun install
bun run build
```

Verify:
- `bun install` completes with no errors or warnings
- `bun run build` succeeds
- `bun run typecheck` passes
- `bun run lint` shows no new errors
