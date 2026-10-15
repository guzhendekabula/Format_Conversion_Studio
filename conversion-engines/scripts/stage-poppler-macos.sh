#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
brew list poppler >/dev/null 2>&1 || brew install poppler
brew list dylibbundler >/dev/null 2>&1 || brew install dylibbundler
PREFIX="$(brew --prefix poppler)"
HOMEBREW_PREFIX="$(brew --prefix)"
STAGE="$ROOT/conversion-engines/poppler/dist/darwin"
rm -rf "$STAGE"
mkdir -p "$STAGE/lib"
for tool in pdftoppm pdfinfo pdftocairo; do cp "$PREFIX/bin/$tool" "$STAGE/$tool"; done
cp -R "$PREFIX/share/poppler" "$STAGE/share-poppler"

# Homebrew's Poppler binaries use @rpath for libpoppler and absolute opt links
# for some dependencies. Give dylibbundler every installed formula lib folder
# so it can resolve these references without an interactive path prompt.
SEARCH_ARGS=()
for library_dir in "$HOMEBREW_PREFIX"/opt/*/lib; do
  if [ -d "$library_dir" ]; then
    SEARCH_ARGS+=( -s "$library_dir" )
  fi
done

for tool in pdftoppm pdfinfo pdftocairo; do
  dylibbundler -od -b -x "$STAGE/$tool" -d "$STAGE/lib/" -p '@executable_path/lib/' "${SEARCH_ARGS[@]}"
done
