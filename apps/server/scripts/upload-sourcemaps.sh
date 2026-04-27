#!/usr/bin/env bash
# Upload Cloudflare Worker bundle source maps to Sentry.
#
# Called by `postdeploy` after `wrangler deploy --upload-source-maps` writes
# bundle + .map files into ./dist. Token resolution order:
#   1. SENTRY_AUTH_TOKEN already in env (CF Workers Builds 在 dashboard 配)
#   2. apps/server/.env.sentry-build-plugin（本地 manual deploy 用，gitignored）
# 任何一种都拿不到时安静跳过 —— 部署本身不挂。
set -euo pipefail

if [ -f .env.sentry-build-plugin ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.sentry-build-plugin
  set +a
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo 'SENTRY_AUTH_TOKEN not set, skipping source map upload'
  exit 0
fi

RELEASE=$(sentry-cli releases propose-version)
sentry-cli sourcemaps upload \
  --org dzfun \
  --project apollokit-server \
  --release "$RELEASE" \
  --strip-prefix 'dist/..' \
  dist
