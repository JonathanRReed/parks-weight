#!/bin/sh
# Copies only the files the site serves into a clean directory and prints its path.
set -eu
cd "$(dirname "$0")/.."
out=$(mktemp -d)
cp index.html style.css robots.txt sitemap.xml site.webmanifest _headers favicon.ico favicon.svg apple-touch-icon.png icon-192.png icon-512.png og.png parks.json shapes.json lands.json land-shapes.json us-states.json "$out"/
cp -R js fonts "$out"/
echo "$out"
