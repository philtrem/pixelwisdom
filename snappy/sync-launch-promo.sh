#!/usr/bin/env bash
# Mirrors the root site into ./launch-promo/ so both paths serve the same
# content. The page's inline script detects /launch-promo/ in the URL and
# flips on promo mode (unhides the 50%-off callout + appends LAUNCH50 to
# Stripe Buy links). Run this after any edit to the root files before
# committing, or set up a pre-commit hook.

set -euo pipefail
cd "$(dirname "$0")"

mkdir -p launch-promo
cp index.html styles.css script.js success.html stripe-product.png launch-promo/
rsync -a --delete icons/ launch-promo/icons/

echo "launch-promo/ synced from root."
