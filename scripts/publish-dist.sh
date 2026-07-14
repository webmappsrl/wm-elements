#!/usr/bin/env bash
# Builds a single widget's production custom-element bundle and publishes it
# under its own subfolder on the shared `dist` branch (served via jsDelivr —
# see README.md "Consegna del webcomponent"), tagging the commit as
# dist-<widget>-YYYYMMDD-HHmm for rollback (re-point `dist` to a previous tag
# instead of a destructive force-push).
#
# This repo hosts multiple widgets over time (see CLAUDE.md) — each widget
# gets its own dist/<widget>/ build output (angular.json configurations) and
# its own dist/<widget>/ subfolder on the `dist` branch. Publishing one widget
# must never touch another widget's already-published files.
#
# Usage: ./scripts/publish-dist.sh <widget-name>
set -euo pipefail

WIDGET="${1:?Usage: ./scripts/publish-dist.sh <widget-name> (e.g. wm-layer-map)}"

cd "$(git rev-parse --show-toplevel)"

if [[ ! -d "src" ]] || ! grep -q "\"${WIDGET}\"" angular.json; then
  echo "Error: no build configuration named '${WIDGET}' found in angular.json." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree has uncommitted changes. Commit or stash before publishing." >&2
  exit 1
fi

# --deploy-url bakes the final jsDelivr URL as webpack's publicPath, so lazy
# chunks resolve against the CDN instead of the customer's own page: with
# `<script type="module">`, `document.currentScript` is always null, so
# webpack's default `publicPath: 'auto'` can't infer it and falls back to the
# host page's own URL — any lazy-loaded chunk 404s on every embedding site.
# Only the published build needs this: local `npm run build:test:*` builds
# stay deploy-url-free so they can be verified against a local static server
# before the URL below actually exists.
DEPLOY_URL="https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/${WIDGET}/"
npx ng build --configuration="production,${WIDGET}" --deploy-url="${DEPLOY_URL}"

if [[ ! -d "dist/${WIDGET}" ]]; then
  echo "Error: build did not produce dist/${WIDGET} — check the '${WIDGET}' configuration's outputPath in angular.json." >&2
  exit 1
fi

TAG="dist-${WIDGET}-$(date +%Y%m%d-%H%M)"
WORKTREE_DIR="$(mktemp -d)/wm-elements-dist"

if git show-ref --verify --quiet refs/remotes/origin/dist; then
  git fetch origin dist
  git worktree add "$WORKTREE_DIR" dist
elif git show-ref --verify --quiet refs/heads/dist; then
  git worktree add "$WORKTREE_DIR" dist
else
  git worktree add --detach "$WORKTREE_DIR"
  (cd "$WORKTREE_DIR" && git checkout --orphan dist && git rm -rf . > /dev/null 2>&1 || true)
fi

# Only replace this widget's own subfolder — other widgets already published
# on the `dist` branch (in their own dist/<other-widget>/ subfolder) must
# survive untouched.
rm -rf "${WORKTREE_DIR:?}/${WIDGET}"
mkdir -p "${WORKTREE_DIR}/${WIDGET}"
cp -r "dist/${WIDGET}"/* "${WORKTREE_DIR}/${WIDGET}"/

# ng build hashes entry bundle filenames (outputHashing: all) so browser caches
# bust on every deploy — but the customer's <script src> must never change
# (CLAUDE.md: "URL jsDelivr fissa"). Rename the top-level entry files to fixed
# names inside the published copy only (not in dist/<widget>/, so local
# ng build output stays untouched for repeated cache-busted local testing).
# Safe because entry files are loaded via <script>/<link> tags only — verified
# no other emitted file references them by their hashed name (lazy chunks use
# webpack's own hash-aware runtime manifest, independent of entry filenames).
pushd "${WORKTREE_DIR}/${WIDGET}" > /dev/null
INDEX_HTML="index.html"
for prefix in runtime polyfills scripts main; do
  hashed_file=$(ls "${prefix}".*.js 2>/dev/null | head -1)
  if [[ -n "$hashed_file" ]]; then
    mv "$hashed_file" "${prefix}.js"
    sed -i.bak "s#${hashed_file}#${prefix}.js#g" "$INDEX_HTML"
  fi
done
hashed_css=$(ls styles.*.css 2>/dev/null | head -1)
if [[ -n "$hashed_css" ]]; then
  mv "$hashed_css" "styles.css"
  sed -i.bak "s#${hashed_css}#styles.css#g" "$INDEX_HTML"
fi
rm -f "${INDEX_HTML}.bak"
popd > /dev/null

# Single customer-facing entry point (<script type="module" src=".../<widget>.js">),
# mirroring the old vanilla-JS widget's one-script integration — internally
# sequences loading of the renamed bundles above. Copied (not moved) from a
# version-controlled template so it's reviewable/diffable like any other file.
# (cwd is the repo root here — pushd/popd above only affected the directory
# stack inside the worktree, not this shell's own working directory.)
cp "scripts/widget-loader.template.js" "${WORKTREE_DIR}/${WIDGET}/${WIDGET}.js"

pushd "$WORKTREE_DIR" > /dev/null
git add -A
if git diff --cached --quiet; then
  echo "Nessuna modifica al bundle ${WIDGET} — skip commit/tag, purge cache comunque."
else
  git commit -m "chore: publish ${WIDGET} dist bundle (${TAG})"
  git tag "$TAG"
  git push origin HEAD:dist
  git push origin "$TAG"
fi
popd > /dev/null

# jsDelivr caches fixed entry filenames (runtime.js, main.js, ...) across deploys.
# A stale runtime.js still points at deleted lazy chunks after a new publish.
# Purge every file we just pushed so the stable @dist URL updates immediately.
echo ""
echo "Purge cache jsDelivr..."
CDN_BASE="/gh/webmappsrl/wm-elements@dist/${WIDGET}"
for published_file in "${WORKTREE_DIR}/${WIDGET}"/*; do
  if [[ -f "$published_file" ]]; then
    file_name=$(basename "$published_file")
    if curl -sf "https://purge.jsdelivr.net${CDN_BASE}/${file_name}" > /dev/null; then
      echo "  purged: ${file_name}"
    else
      echo "  purge fallita (non bloccante): ${file_name}" >&2
    fi
  fi
done

git worktree remove "$WORKTREE_DIR" --force

echo ""
echo "Pubblicato: branch 'dist' aggiornato (sottocartella '${WIDGET}/'), tag '$TAG' creato."
echo "URL jsDelivr stabile:"
echo "  https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/${WIDGET}/${WIDGET}.js"
echo "Cache jsDelivr purgata per tutti i file pubblicati in dist/${WIDGET}/."
echo "Per il rollback: ripunta 'dist' a un tag precedente (git push origin <tag>:dist --force), mai un push distruttivo diretto."
