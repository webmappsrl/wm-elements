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

# Customer-facing URL stays .../<widget>.js (stable). This loader is regenerated
# each publish with the current hashed Angular entry filenames — never rename
# runtime/polyfills/scripts/main to fixed names on dist (jsDelivr caches those
# aggressively and purge is unreliable; hashed names bust cache automatically).
pushd "${WORKTREE_DIR}/${WIDGET}" > /dev/null
RUNTIME_JS=$(ls runtime.*.js 2>/dev/null | head -1)
POLYFILLS_JS=$(ls polyfills.*.js 2>/dev/null | head -1)
SCRIPTS_JS=$(ls scripts.*.js 2>/dev/null | head -1)
MAIN_JS=$(ls main.*.js 2>/dev/null | head -1)
STYLES_CSS=$(ls styles.*.css 2>/dev/null | head -1)
for required in RUNTIME_JS POLYFILLS_JS SCRIPTS_JS MAIN_JS STYLES_CSS; do
  if [[ -z "${!required}" ]]; then
    echo "Error: missing ${required#*_} in dist/${WIDGET} build output." >&2
    exit 1
  fi
done
popd > /dev/null

sed -e "s#__RUNTIME_JS__#${RUNTIME_JS}#" \
    -e "s#__POLYFILLS_JS__#${POLYFILLS_JS}#" \
    -e "s#__SCRIPTS_JS__#${SCRIPTS_JS}#" \
    -e "s#__MAIN_JS__#${MAIN_JS}#" \
    -e "s#__STYLES_CSS__#${STYLES_CSS}#" \
    "scripts/widget-loader.template.js" > "${WORKTREE_DIR}/${WIDGET}/${WIDGET}.js"

pushd "$WORKTREE_DIR" > /dev/null
git add -A
PUBLISHED=false
if git diff --cached --quiet; then
  echo "Nessuna modifica al bundle ${WIDGET} — skip commit/tag, purge cache comunque."
else
  git commit -m "chore: publish ${WIDGET} dist bundle (${TAG})"
  git tag "$TAG"
  git push origin HEAD:dist
  git push origin "$TAG"
  PUBLISHED=true
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
if [[ "$PUBLISHED" == true ]]; then
  echo "Pubblicato: branch 'dist' aggiornato (sottocartella '${WIDGET}/'), tag '$TAG' creato."
else
  echo "Bundle '${WIDGET}' invariato — branch 'dist' non aggiornato."
fi
echo "URL jsDelivr stabile:"
echo "  https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/${WIDGET}/${WIDGET}.js"
echo "Cache jsDelivr purgata per tutti i file pubblicati in dist/${WIDGET}/."
echo "Per il rollback: ripunta 'dist' a un tag precedente (git push origin <tag>:dist --force), mai un push distruttivo diretto."
