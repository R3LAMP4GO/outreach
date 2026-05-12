---
description: Create a clear, human-readable git commit
---

Analyze the current git changes and create a commit with a clear, concise message.

Requirements:
- Run `git status` and `git diff --staged` (or `git diff` if nothing staged)
- Write a commit message that's human-readable and to the point
- Use conventional commit format: `feat:`, `fix:`, `chore:`, `perf:`, `refactor:`
- Summary line: 50 chars max, present tense ("Add feature" not "Added feature")
- Focus on WHAT changed and WHY, not HOW
- Be specific and clear — avoid vague terms like "fix stuff" or "update code"
- For multi-line messages, add a blank line then bullet points for details

After drafting the message, create the commit using `git commit -m "message"`.

If nothing is staged, ask if I should stage all changes first.

## GitGuardian / Secret Scanning

Before committing, check for patterns that trigger false positives in secret scanners:
- **Never use `sk-`, `sk_test`, `sk_live`, `pk_test`, `pk_live`, `re_` prefixes** in test fixtures or example code — even with fake values. Use `test_key_`, `test-credential-`, or `example-` prefixes instead.
- **Never include `AKIA` (AWS), `ghp_` (GitHub), `glpat-` (GitLab), `xoxb-` (Slack)** prefixes in any committed code.
- Secret scanners check the **full commit history** of a PR, not just the latest commit. Once a pattern is committed, it stays flagged even if removed in a later commit.
- If a false positive is unavoidable, it must be resolved in the GitGuardian dashboard — it cannot be fixed by removing the string in a follow-up commit.
