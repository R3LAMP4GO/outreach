---
name: trace
description: Trace a capability through every layer of the project — find dropped config, missing wiring, drifted duplicates, and shape mismatches. Use when debugging why a feature doesn't work end-to-end or auditing data flow integrity.
user_invocable: true
arguments:
  - name: capability
    description: The capability or feature to trace (e.g., "Gmail OAuth", "invoice source tracking", "distributor cache")
    required: true
---

# Wiring Trace

Trace the specified capability through every layer of the project.

## Input

The user provides `$ARGUMENTS` describing the capability to trace. Parse it as:
- **Capability**: what to trace (e.g., "auth token propagation", "source field", "Gmail OAuth flow")
- **Scope**: optionally a directory or set of files to focus on (default: full project)

## Step 1: Map the architecture

Identify the layers this capability touches:

```
Entry Points → Orchestration → Capability Modules → External (APIs, DB, browser, network)
     ↑                                                    ↑
  Config/Options flow rightward through these layers
```

Use Glob and Grep to find all files that reference the capability. Build a map of:
- **Entry points**: API routes, UI handlers, CLI commands, cron triggers
- **Orchestration**: middleware, service layers, shared helpers
- **Modules**: the functions that implement the capability
- **External**: API calls, DB queries, browser APIs, network requests

## Step 2: Trace every path

Starting from each entry point, follow the capability through to where it's consumed. Read each file in the chain. Track:
- What data/config enters at each layer
- What gets passed to the next layer
- What arrives at the destination

## Step 3: Check for gaps

At each layer boundary, check for:

1. **Dropped config** — Option/flag exists at entry but never reaches the function that needs it
2. **Silent defaults** — Value gets replaced with a default mid-pipeline instead of being passed through
3. **Partial wiring** — Feature works in path A but not path B
4. **Stale wrappers** — A wrapper/adapter exposes a subset of the underlying interface and has fallen behind
5. **Missing gates** — Decision points where the user should be prompted but isn't
6. **Dead exports** — Module exports capability X but nothing imports it
7. **Shape mismatches** — Data enters as type A, gets transformed, arrives at destination missing fields

## Step 4: Report

For each issue found, report:
- **WHERE**: exact `file:line` at each end (entry point AND consumption point)
- **WHAT**: what gets lost/broken between those two points
- **WHY IT MATTERS**: what fails or silently degrades as a result

Do NOT report:
- Style issues, naming, code quality
- Theoretical problems that can't actually be triggered
- Things that work correctly end-to-end

## Output format

```markdown
# Wiring Trace: [Capability Name]

Date: [YYYY-MM-DD]
Scope: [Full project / specific area]

## Architecture Map

[Entry Points] → [Orchestration] → [Modules] → [External]
List the specific files at each layer.

## Paths Traced

### Path 1: [e.g., Addon → API → Gmail]
- Entry: [file:line — where it enters]
- Through: [file:line — each intermediate layer]
- Destination: [file:line — where it's consumed]
- Status: OK | GAP FOUND

### Path 2: ...

## Gaps Found

| # | Where | What's Lost | Impact | Severity |
|---|-------|------------|--------|----------|
| 1 | entry.ts:42 → service.ts:181 | Config X not forwarded | Feature Y fails silently | Critical |

### Gap 1: [Short description]
**Trace**: enters at `file:line` → passes through `file:line` → breaks at `file:line`
**What happens**: [concrete description of the failure]
**Fix**: [suggested fix]

## Systemic Patterns
- [Pattern 1: e.g., "Token refresh inconsistent across 3 entry points"]
- [Pattern 2: e.g., "Error messages don't propagate from helpers to API responses"]

## Summary
- Paths traced: [N]
- Gaps found: [N] (Critical: X, High: Y, Medium: Z)
- Systemic patterns: [N]
```

## Rules

- Use the Explore agent or parallel Grep/Read calls to trace efficiently
- Follow imports and function calls — don't guess at the chain
- Only report gaps you can prove by reading the code at both ends
- Severity: **Critical** = feature broken, **High** = silent data loss or degradation, **Medium** = edge case failure
- If no gaps found, say so — a clean trace is a valid result
- After writing the trace report, create tasks (using the `tasks` tool with action "add") for any Critical or High severity gaps found
