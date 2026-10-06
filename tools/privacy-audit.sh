#!/usr/bin/env bash
# Privacy audit: fails if staged changes (or, with --all, every tracked file) contain personal data.
# Generic patterns live here; learner-specific terms live in data/private/audit-terms.txt (gitignored).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

patterns=(
  '[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|yahoo|web|gmx)\.[a-z]+'
  'script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}'
  'docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{20,}'
  'drive\.google\.com/drive/folders/[A-Za-z0-9_-]{20,}'
  '\b1[A-Za-z0-9_-]{32,43}\b'
  'trig_[A-Za-z0-9]{10,}'
  'env_[A-Za-z0-9]{10,}'
  'canva\.(link|com/design)/[A-Za-z0-9]'
  '(APP_TOKEN|token)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9_-]{16,}'
)
if [[ -f data/private/audit-terms.txt ]]; then
  while IFS= read -r t; do [[ -n "$t" ]] && patterns+=("$t"); done < data/private/audit-terms.txt
fi
re=$(IFS='|'; echo "${patterns[*]}")

if [[ "${1:-}" == "--all" ]]; then
  hits=$(git ls-files -z | xargs -0 grep -n -i -I -E "$re" -- 2>/dev/null | grep -v "\"integrity\": \"sha512-" || true)
else
  hits=$(git diff --cached -U0 | grep -n -i -E "^+.*($re)" | grep -v "\"integrity\": \"sha512-" || true)
fi

if [[ -n "$hits" ]]; then
  echo "PRIVACY AUDIT FAILED:"; echo "$hits"; exit 1
fi
echo "privacy audit: clean"
