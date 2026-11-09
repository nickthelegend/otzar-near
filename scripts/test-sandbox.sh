#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/sandbox.sh start
trap 'scripts/sandbox.sh stop' EXIT
node scripts/test-sandbox.mjs
