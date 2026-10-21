#!/bin/sh
# Deploys the site to Cloudflare Pages (project parks-and-scale, served at pw.jonathanrreed.com).
set -eu
out=$("$(dirname "$0")/stage.sh")
trap 'rm -rf "$out"' EXIT
npx wrangler@latest pages deploy "$out" --project-name parks-and-scale --branch main --commit-dirty=true
