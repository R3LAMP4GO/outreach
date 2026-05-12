#!/bin/bash

# Security: Prevent committing secrets
# This script checks for common secret patterns before commits

echo "🔒 Checking for potential secrets..."

# Patterns to check
patterns=(
  "sb_secret_"
  "sb_publishable_"
  "re_[a-zA-Z0-9]{30,}"
  "sk-[a-zA-Z0-9]{30,}"
  "AIzaSy[a-zA-Z0-9_-]{33}"
  "cal_live_[a-zA-Z0-9]{30,}"
  "xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}"
  "ghp_[a-zA-Z0-9]{36}"
  "github_pat_[a-zA-Z0-9_]{82}"
  "AKIA[0-9A-Z]{16}"
  "[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}"
)

found_secrets=0

# Check staged files
for pattern in "${patterns[@]}"; do
  matches=$(git diff --cached --name-only -z --diff-filter=ACM | xargs -0 grep -lE "$pattern" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    echo "❌ Found potential secrets matching pattern: $pattern"
    echo "   in files:"
    echo "$matches" | while read -r file; do
      echo "   - $file"
    done
    found_secrets=1
  fi
done

if [ $found_secrets -eq 1 ]; then
  echo ""
  echo "❌ COMMIT BLOCKED: Potential secrets detected!"
  echo "   Please remove secrets from the files above before committing."
  echo "   Use: git reset HEAD <file> to unstage files"
  exit 1
fi

echo "✅ No secrets detected"
exit 0
