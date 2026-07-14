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
// deploy. Hashed Angular entry filenames are resolved at runtime via the
// jsDelivr Data API (https://www.jsdelivr.com/docs/data.jsdelivr.com) so the
// stable @dist <widget>.js URL never needs to change — only hashed bundles do.
(function () {
  const base = new URL('.', import.meta.url).href;
  const widgetName = new URL(import.meta.url).pathname.split('/').pop().replace(/\.js$/, '');
  const packageIndexUrl =
    'https://data.jsdelivr.com/v1/package/gh/webmappsrl/wm-elements@dist/flat';

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

  function resolveEntries(files) {
    const prefix = `/${widgetName}/`;
    const pick = (pattern) => {
      const entry = files.find(
        (f) => f.name.startsWith(prefix) && pattern.test(f.name.slice(prefix.length)),
      );
      return entry ? entry.name.slice(prefix.length) : null;
    };
    const entries = {
      runtime: pick(/^runtime\.[^/]+\.js$/),
      polyfills: pick(/^polyfills\.[^/]+\.js$/),
      scripts: pick(/^scripts\.[^/]+\.js$/),
      main: pick(/^main\.[^/]+\.js$/),
      styles: pick(/^styles\.[^/]+\.css$/),
    };
    for (const [key, value] of Object.entries(entries)) {
      if (!value) throw new Error(`missing ${key} in jsDelivr package index`);
    }
    return entries;
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

  fetch(packageIndexUrl, {cache: 'no-store'})
    .then((r) => {
      if (!r.ok) throw new Error(`package index HTTP ${r.status}`);
      return r.json();
    })
    .then(({files}) => loadBundles(resolveEntries(files)))
    .catch((err) => console.error('[wm-elements] failed to load widget bundle:', err));
})();
