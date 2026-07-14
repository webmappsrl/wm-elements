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
import {WidgetEnvironmentService} from './services/widget-environment.service';
import {fakeActivatedRoute} from './services/fake-activated-route';
import {WmLayerMapComponent} from './wm-layer-map/wm-layer-map.component';
import {EnvironmentService} from '@wm-core/services/environment.service';

type HostConfig = {shardName: ShardName; appId: number};

function readHostConfig(el: Element): HostConfig | null {
  const host = el as HTMLElement & {shard?: string; appId?: string};
  const shard = el.getAttribute('shard') ?? host.shard ?? null;
  const appIdRaw = el.getAttribute('app-id') ?? host.appId ?? null;
  if (!shard || appIdRaw == null || appIdRaw === '') {
    return null;
  }
  const appId = Number(appIdRaw);
  if (Number.isNaN(appId)) {
    return null;
  }
  return {shardName: shard as ShardName, appId};
}

function findReadyHost(candidates: Iterable<Element> = document.querySelectorAll('wm-layer-map')): Element | null {
  for (const el of candidates) {
    if (el.isConnected && readHostConfig(el)) {
      return el;
    }
  }
  return null;
}

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', () => resolve(), {once: true});
  });
}

function waitForHostElement(
  candidates: Element[],
  timeoutMs = 30000,
): Promise<Element | null> {
  const ready = findReadyHost(candidates);
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
      const el = findReadyHost(candidates);
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
        finish(null);
        return;
      }
      timer = setTimeout(poll, 50);
    };
    timer = setTimeout(poll, 50);
  });
}

function buildEnvironment(config: HostConfig): Environment {
  const {shardName, appId} = config;
  return {
    production: true,
    appId,
    shardName,
    shards,
    redirects: {},
  };
}

let bootstrapPromise: Promise<void> | null = null;

export function bootstrapWidget(hostCandidates: Element[] = []): Promise<void> {
  if (customElements.get('wm-layer-map')) {
    return Promise.resolve();
  }
  bootstrapPromise ??= bootstrapWidgetOnce(hostCandidates);
  return bootstrapPromise;
}

async function bootstrapWidgetOnce(hostCandidates: Element[]): Promise<void> {
  await waitForDocumentReady();
  const hostElement = await waitForHostElement(hostCandidates);
  const hostConfig = hostElement ? readHostConfig(hostElement) : null;
  if (!hostConfig) {
    console.error(
      '[wm-layer-map] bootstrap aborted: <wm-layer-map> with valid shard and app-id was not found.',
    );
    return;
  }

  const environment = buildEnvironment(hostConfig);

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
      {provide: EnvironmentService, useClass: WidgetEnvironmentService},
      {provide: ActivatedRoute, useValue: fakeActivatedRoute},
    ],
  });

  const wmLayerMapElement = createCustomElement(WmLayerMapComponent, {injector: app.injector});
  customElements.define('wm-layer-map', wmLayerMapElement);
}
