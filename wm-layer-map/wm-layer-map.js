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
(function () {
  const base = new URL('.', import.meta.url).href;

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

  loadStyle('styles.css');
  // Loaded strictly in sequence: `runtime.js` sets up Webpack's module
  // registry, `polyfills.js` (zone.js) must run before Angular code executes,
  // `scripts.js` (graphhopper-client) before `main.js`, which bootstraps the
  // actual <wm-layer-map> custom element.
  loadScript('runtime.js')
    .then(() => loadScript('polyfills.js'))
    .then(() => loadScript('scripts.js', {module: false}))
    .then(() => loadScript('main.js'))
    .catch(err => console.error('[wm-elements] failed to load widget bundle:', err));
})();
