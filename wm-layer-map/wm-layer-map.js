// Single entry point published for each widget (e.g. wm-layer-map.js), so the
// customer embed matches the old vanilla-JS widget's one-<script>-tag
// integration (see https://github.com/webmappsrl/wm-layer-map) even though
// this widget is built with Angular/Webpack, which normally splits output
// into several entry bundles (runtime/polyfills/scripts/main) that must be
// loaded in order.
//
// Must be loaded as <script type="module"> so `import.meta.url` is available
// — it's how this file finds its sibling bundles regardless of where it's
// hosted (jsDelivr, a local static server, ...), without needing any global
// config or a second attribute on the customer's <script> tag.
//
// This file is intentionally static: publish-dist.sh copies it as-is on every
// deploy. Hashed Angular entry filenames are resolved at runtime from the
// entries.json manifest written by publish-dist.sh next to the bundles.
//
// The manifest is read from raw.githubusercontent.com (cache ~5 min, no purge
// needed) and NOT from the jsDelivr Data API: the Data API caches the branch
// listing with max-age of ONE YEAR and its origin's branch→commit resolution
// can stay stuck on a stale commit indefinitely — after the 2026-07-15
// publish it kept resolving the previous generation of (deleted) bundles,
// breaking every embed. cdn.jsdelivr.net (sibling entries.json) is kept as a
// fallback: it is purged on every publish by publish-dist.sh.
(function () {
  const base = new URL('.', import.meta.url).href;
  const widgetName = new URL(import.meta.url).pathname.split('/').pop().replace(/\.js$/, '');
  const manifestUrls = [
    `https://raw.githubusercontent.com/webmappsrl/wm-elements/dist/${widgetName}/entries.json`,
    base + 'entries.json',
  ];

  function loadStyle(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + href;
    document.head.appendChild(link);
  }

  function loadScript(src, {module = true} = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // graphhopper-client.js (the "scripts" bundle below) assigns to an
      // undeclared global (`GraphHopperRouting = function...`) — legal in a
      // classic script, a ReferenceError in a module's implicit strict mode.
      // Must stay a classic script, unlike the other three Angular bundles.
      if (module) script.type = 'module';
      script.src = base + src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function fetchManifest(urls) {
    const [url, ...rest] = urls;
    return fetch(url, {cache: 'no-store'})
      .then((r) => {
        if (!r.ok) throw new Error(`manifest HTTP ${r.status} (${url})`);
        return r.json();
      })
      .then((entries) => {
        for (const key of ['runtime', 'polyfills', 'scripts', 'main', 'styles']) {
          if (!entries[key]) throw new Error(`missing ${key} in entries.json (${url})`);
        }
        return entries;
      })
      .catch((err) => {
        if (rest.length === 0) throw err;
        console.warn(`[wm-elements] manifest fetch failed, trying fallback:`, err);
        return fetchManifest(rest);
      });
  }

  function loadBundles(entries) {
    loadStyle(entries.styles);
    // Loaded strictly in sequence: runtime sets up Webpack's module registry,
    // polyfills (zone.js) before Angular, scripts (graphhopper) before main.
    return loadScript(entries.runtime)
      .then(() => loadScript(entries.polyfills))
      .then(() => loadScript(entries.scripts, {module: false}))
      .then(() => loadScript(entries.main));
  }

  fetchManifest(manifestUrls)
    .then((entries) => loadBundles(entries))
    .catch((err) => console.error('[wm-elements] failed to load widget bundle:', err));
})();
