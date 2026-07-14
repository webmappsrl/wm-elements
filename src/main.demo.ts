import {bootstrapApplication} from '@angular/platform-browser';
import {importProvidersFrom} from '@angular/core';
import {provideHttpClient} from '@angular/common/http';
import {ActivatedRoute} from '@angular/router';
import {StoreModule} from '@ngrx/store';
import {EffectsModule} from '@ngrx/effects';
import {IonicModule} from '@ionic/angular';
import {UrlHandlerService} from '@wm-core/services/url-handler.service';
import {WmCoreModule} from '@wm-core/wm-core.module';
import {shards, Environment} from '@wm-types/environment';
import {LocalUrlHandlerService} from './app/services/local-url-handler.service';
import {fakeActivatedRoute} from './app/services/fake-activated-route';
import {DemoComponent} from './app/demo/demo.component';

// EnvironmentService.init() runs once at bootstrap (via APP_INITIALIZER in
// WmCoreModule.forRoot) and resolves shard/appId from this static object —
// it does NOT react to later changes in DemoComponent's form fields. These
// values must match DemoComponent's default shard/appId so the PBF tile URL
// (computed once by EnvironmentService) is correct on first render. Changing
// the form fields at runtime updates WmLayerMapComponent's own config fetch,
// but NOT this resolved PBF URL — a known demo-only limitation. The real
// widget (main.ts) doesn't have this problem: it reads the shard/app-id
// attributes from the DOM before bootstrapping, once, correctly.
const environment: Environment = {
  production: false,
  appId: 1,
  shardName: 'camminiditalia',
  shards,
  redirects: {},
};

bootstrapApplication(DemoComponent, {
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
}).catch(err => console.error(err));
