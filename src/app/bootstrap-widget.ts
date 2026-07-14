import {createApplication} from '@angular/platform-browser';
import {createCustomElement} from '@angular/elements';
import {importProvidersFrom} from '@angular/core';
import {provideHttpClient} from '@angular/common/http';
import {ActivatedRoute} from '@angular/router';
import {StoreModule} from '@ngrx/store';
import {EffectsModule} from '@ngrx/effects';
import {IonicModule} from '@ionic/angular';
import {UrlHandlerService} from '@wm-core/services/url-handler.service';
import {WmCoreModule} from '@wm-core/wm-core.module';
import {shards, Environment, ShardName} from '@wm-types/environment';
import {LocalUrlHandlerService} from './services/local-url-handler.service';
import {fakeActivatedRoute} from './services/fake-activated-route';
import {WmLayerMapComponent} from './wm-layer-map/wm-layer-map.component';

// Some third-party pages (observed with an online HTML preview tool) insert
// the <wm-layer-map> tag's attributes slightly AFTER the tag itself exists in
// the DOM — a single synchronous querySelector at this point can find the
// element with no `shard`/`app-id` yet, silently falling back to defaults
// ('geohub'/NaN). Wait for `shard` to appear via MutationObserver (works in
// hidden tabs/iframes where requestAnimationFrame is suspended) with a
// setTimeout fallback poll before giving up.
function findHostWithShard(): Element | null {
  const el = document.querySelector('wm-layer-map');
  return el?.getAttribute('shard') ? el : null;
}

function waitForHostElement(timeoutMs = 2000): Promise<Element | null> {
  const ready = findHostWithShard();
  if (ready) {
    return Promise.resolve(ready);
  }

  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs;
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (el: Element | null) => {
      observer?.disconnect();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      resolve(el);
    };

    const check = (): boolean => {
      const el = findHostWithShard();
      if (el) {
        finish(el);
        return true;
      }
      return false;
    };

    observer = new MutationObserver(() => {
      check();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['shard', 'app-id'],
    });

    const poll = () => {
      if (check()) {
        return;
      }
      if (Date.now() >= deadline) {
        finish(document.querySelector('wm-layer-map'));
        return;
      }
      timer = setTimeout(poll, 50);
    };
    timer = setTimeout(poll, 50);
  });
}

(async () => {
  const hostElement = await waitForHostElement();
  const shardName = (hostElement?.getAttribute('shard') ?? 'geohub') as ShardName;
  const appId = Number(hostElement?.getAttribute('app-id') ?? '0');
  const hostname = window.location.hostname;

  // EnvironmentService (wm-core) resolves shard/appId from window.location.hostname,
  // designed for the webapp's per-subdomain hosting model. For an embeddable widget
  // running on an arbitrary third-party domain, we force resolution via the existing
  // `redirects` mechanism instead of touching wm-core: a redirect entry that always
  // matches the current hostname, pointing to the shard/appId passed as HTML attributes.
  const environment: Environment = {
    production: true,
    appId,
    shardName,
    shards,
    redirects: {
      [hostname]: {shardName, appId},
    },
  };

  const app = await createApplication({
    providers: [
      provideHttpClient(),
      importProvidersFrom(
        StoreModule.forRoot({}),
        EffectsModule.forRoot([]),
        IonicModule.forRoot(),
        WmCoreModule.forRoot({
          appVersion: '0.0.0',
          environment,
          posthog: {apiKey: '', enabled: false, host: ''},
        }),
      ),
      {provide: UrlHandlerService, useClass: LocalUrlHandlerService},
      {provide: ActivatedRoute, useValue: fakeActivatedRoute},
    ],
  });

  const wmLayerMapElement = createCustomElement(WmLayerMapComponent, {injector: app.injector});
  customElements.define('wm-layer-map', wmLayerMapElement);
})();
