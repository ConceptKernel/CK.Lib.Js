#!/usr/bin/env bash
# gh-watch.sh <tag> — wait for the GitHub Actions release pipeline for <tag>,
# print the outcome, fire a macOS notification.
#
# Run it BACKGROUNDED from a Claude Code Bash call (run_in_background: true):
# the harness re-invokes the agent with this script's output when the pipeline
# settles. No hooks, no temp files, no settings.json.
#
# Pipeline (per PROVENANCE.md): oci-publish.yml does build + push + attest +
# verify + LATEST.md render + GitHub Release + LATEST.md commit, all in one
# job (collapsed since v1.3.9 — no chained workflow_run). A release is "in"
# only when oci-publish.yml exits success AND the bot-committed LATEST.md
# advances on origin/main.
#
# SHA-keyed so parallel pushes of different tags never cross.
#
#   scripts/gh-watch.sh v1.3.11
#   scripts/gh-watch.sh            # most recent local tag (git describe)

set -euo pipefail

tag="${1:-$(git describe --tags --abbrev=0 2>/dev/null || true)}"
[ -z "$tag" ] && { echo "Usage: $0 <tag>" >&2; exit 2; }

notify() {
  command -v osascript >/dev/null 2>&1 || return 0
  osascript -e "display notification \"$2\" with title \"CK.Lib.Js release\" sound name \"$1\"" 2>/dev/null || true
}
trap 'echo "✗ Release FAILED: $tag"; notify Sosumi "$tag pipeline failed"' ERR

case "$tag" in
  v*) wf="oci-publish.yml" ;;
  *) echo "Unknown tag pattern: $tag (expected v*)" >&2; exit 2 ;;
esac

echo "▶ Watching release pipeline for $tag ($wf)"
sha=$(git rev-list -n1 "$tag" 2>/dev/null || true)
[ -z "$sha" ] && { echo "Cannot resolve $tag SHA (pushed yet?)" >&2; exit 2; }
echo "  SHA ${sha:0:12}"

find_run() {
  local workflow="$1" run=""
  for _ in $(seq 1 10); do
    run=$(gh run list --workflow="$workflow" --limit 20 --json databaseId,headSha \
      --jq ".[] | select(.headSha == \"$sha\") | .databaseId" | head -1)
    [ -n "$run" ] && { echo "$run"; return 0; }
    sleep 3
  done
  return 1
}

run=$(find_run "$wf") || { echo "✗ no $wf run for $sha after 30s"; exit 1; }
echo "  run $run"
gh run watch "$run" --exit-status

echo "✓ Release in: $tag"
sed -n '1,20p' LATEST.md
notify Glass "$tag pipeline landed"
