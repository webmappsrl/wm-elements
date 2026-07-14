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
import {LocalUrlHandlerService} from './app/services/local-url-handler.service';
import {fakeActivatedRoute} from './app/services/fake-activated-route';
import {WmLayerMapComponent} from './app/wm-layer-map/wm-layer-map.component';

(async () => {
  const hostElement = document.querySelector('wm-layer-map');
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
