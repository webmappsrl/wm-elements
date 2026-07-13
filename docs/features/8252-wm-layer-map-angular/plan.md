> Ticket: oc:8252

# wm-layer-map Angular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ricostruire `<wm-layer-map>` come Angular Element nel nuovo repo `wm-elements`, riusando i componenti esistenti di `wm-core`/`map-core` (mappa, tracce, POI, pannello dettaglio, slope chart) invece di reimplementarli in vanilla JS, mantenendo l'API pubblica del widget attuale e aggiungendo il supporto POI.

**Architecture:** Workspace Angular singolo progetto con submodule `map-core`/`wm-core`/`wm-types` montati a root, path alias identici a `wm-webapp`. Il componente root è bootstrappato via `createCustomElement` con uno store NgRx isolato per istanza che monta l'intero `StoreModule`/`EffectsModule` forniti da `wm-core` (non un sottoinsieme di slice). L'interazione POI/traccia (che nei componenti riusati passa da `UrlHandlerService` → `Router`/`ActivatedRoute` → store) viene mantenuta funzionante sostituendo `UrlHandlerService` con uno shim locale che simula `ActivatedRoute.queryParams` con un `BehaviorSubject` interno, senza mai toccare `window.location` o il Router reale — così lo stato resta interno al componente senza manipolare l'URL della pagina host.

**Tech Stack:** Angular 20, Angular Elements (`@angular/elements`), NgRx (`@ngrx/store`, `@ngrx/effects`), OpenLayers (via `map-core`), Chart.js (via `wm-core/slope-chart`), Shadow DOM.

## Global Constraints

- API pubblica invariata: attributi `shard`, `app-id`, `layer-id` (obbligatori), `cta-label`, `cta-url`, `app-icon-url`, `ios-store-url`, `android-store-url`, `hide-cta`, `lang` (opzionali); eventi `ready`, `track-selected`, `error`; CSS custom properties `--wm-color-primary`, `--wm-color-dark`, `--wm-color-light`, `--wm-color-light-rgb`, `--wm-font-sm`, `--wm-font-family`, `--wm-panel-width`, `--wm-control-size`, `--wm-surface-radius`, `--wm-surface-shadow`; CSS Parts `map-wrap`, `top-bar`, `app-link`, `store-links`, `layer-badge`, `bottom-left`, `scale-line`, `map`, `attribution`, `panel`, `panel-close`, `panel-title`.
- Niente manipolazione dell'URL della pagina host — nessuna dipendenza da Router/ActivatedRoute reali.
- Niente istanze multiple dello stesso widget sulla stessa pagina.
- Store montato per intero (tutti i reducer/effects di `wm-core`), non un sottoinsieme scelto a mano.
- Nessun test automatico Karma/Jasmine in questo repo — verifica solo manuale (`test/index.html`).
- Nessuna modifica a `wm-webapp`, `wm-core`, `map-core`, `wm-types`, o al repo `webmappsrl/wm-layer-map` esistente.
- Repo `wm-elements` pubblico su GitHub.
- Commit convention: `feat(oc:8252): ...` / `fix(oc:8252): ...` / `refactor(oc:8252): ...`. Nessun commit automatico — ogni commit è un'istruzione testuale per lo sviluppatore, da eseguire solo dopo review.

---

### Task 1: Scaffold repo, submodule, path alias

**Files:**
- Create: `~/Documents/wm-elements/angular.json`, `package.json`, `tsconfig.json`, `tsconfig.app.json`
- Create: `.gitmodules`
- Create: `src/app/shared/map-core`, `src/app/shared/wm-core`, `src/app/shared/wm-types` (submodule)

**Interfaces:**
- Produces: alias `@map-core/*` → `src/app/shared/map-core/src/*`, `@wm-core/*` → `src/app/shared/wm-core/projects/wm-core/src/*`, `@wm-types/*` → `src/app/shared/wm-types/src/*` — usati da tutti i task successivi.

- [ ] **Step 1: Genera il progetto Angular**

```bash
cd ~/Documents/wm-elements
npx -y @angular/cli@20 new wm-elements-tmp --directory . --routing=false --style=scss --ssr=false --skip-git
```

Se il comando chiede conferma di sovrascrivere la directory (contiene già `.git`), rispondi sì solo ai file generati, non toccare `.git`.

- [ ] **Step 2: Aggiungi i submodule**

```bash
git submodule add https://github.com/webmappsrl/map-core.git src/app/shared/map-core
git submodule add https://github.com/webmappsrl/wm-core.git src/app/shared/wm-core
git submodule add https://github.com/webmappsrl/wm-types.git src/app/shared/wm-types
git submodule update --init --recursive
```

- [ ] **Step 3: Configura i path alias in `tsconfig.json`**

Aggiungi dentro `compilerOptions.paths`:

```json
{
  "compilerOptions": {
    "paths": {
      "@wm-core/*": ["src/app/shared/wm-core/projects/wm-core/src/*"],
      "@map-core/*": ["src/app/shared/map-core/src/*"],
      "@wm-types/*": ["src/app/shared/wm-types/src/*"]
    }
  }
}
```

- [ ] **Step 4: Installa le dipendenze richieste dai submodule riusati**

Ispeziona `src/app/shared/wm-core/projects/wm-core/package.json` e `src/app/shared/map-core/package.json` (se presenti) per la lista dipendenze runtime (`@ngrx/store`, `@ngrx/effects`, `chart.js`, `ol`, `@ionic/angular` — quest'ultima necessaria perché i template di `wm-core` referenziano tag `ion-*`). Installale:

```bash
npm install @ngrx/store @ngrx/effects ol chart.js @ionic/angular
```

- [ ] **Step 5: Verifica build a vuoto**

```bash
npx ng build
```

Expected: build completata senza errori di risoluzione path (l'app di default generata da `ng new`, ancora senza uso dei submodule, deve solo compilare).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(oc:8252): scaffold wm-elements workspace with map-core/wm-core/wm-types submodules"
```

---

### Task 2: Ambiente di sviluppo demo (live-reload, `ng serve`)

Angular Elements non offre hot-reload comodo se si lavora solo sul bundle custom-element finale (richiede `ng build` + refresh manuale ad ogni modifica). Questo task crea una seconda configurazione dell'app — una "demo app" che monta gli stessi componenti come normali componenti Angular bootstrappati (non come custom element), così lo sviluppo quotidiano usa `ng serve` con hot reload reale. Il bundle custom-element vero (Task 5 in poi) resta la build "di produzione", verificata solo quando serve controllare il comportamento reale da webcomponent (Shadow DOM, mapping attributi, eventi).

**Files:**
- Create: `src/app/demo/demo.component.ts`, `demo.component.html`
- Modify: `src/main.ts` (bootstrap condizionale: demo app in dev, custom element in build elements)
- Modify: `angular.json` (nuova configuration `demo` sul target `build`/`serve`)

**Interfaces:**
- Consumes: `WmLayerMapComponent` (creato più avanti nel Task 6 come shell, poi esteso nei task successivi) — questo task predispone solo l'infrastruttura di serve, il componente demo verrà collegato quando `WmLayerMapComponent` esiste
- Produces: comando `npm run start:demo` per lo sviluppo quotidiano con hot reload

- [ ] **Step 1: Crea il componente demo con form di controllo attributi**

```typescript
// src/app/demo/demo.component.ts
import {Component, ViewEncapsulation} from '@angular/core';

@Component({
  selector: 'app-demo',
  templateUrl: './demo.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class DemoComponent {
  shard = 'camminiditalia';
  appId = '1';
  layerId = '117';
  lang = 'it';
  hideCta = false;
}
```

```html
<!-- src/app/demo/demo.component.html -->
<div style="display:flex; gap:1rem; padding:1rem;">
  <label>shard <input [(ngModel)]="shard" /></label>
  <label>app-id <input [(ngModel)]="appId" /></label>
  <label>layer-id <input [(ngModel)]="layerId" /></label>
  <label>lang <input [(ngModel)]="lang" /></label>
  <label>hide-cta <input type="checkbox" [(ngModel)]="hideCta" /></label>
</div>
<!--
  Da Task 6 in poi: sostituire questo placeholder con
  <app-wm-layer-map-root [shard]="shard" [appId]="appId" [layerId]="layerId" ...></app-wm-layer-map-root>
  montato come componente Angular normale (non custom element) per avere hot reload.
-->
<div style="width:100%; height:600px; border:1px dashed #ccc;">demo placeholder — collegato dal Task 6</div>
```

- [ ] **Step 2: Aggiungi `FormsModule` e bootstrap della demo app**

```typescript
// src/main.ts (sezione demo — coesiste con il bootstrap custom-element aggiunto nel Task 5)
import {bootstrapApplication} from '@angular/platform-browser';
import {importProvidersFrom} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DemoComponent} from './app/demo/demo.component';

if ((window as any).__WM_ELEMENTS_DEMO__) {
  bootstrapApplication(DemoComponent, {
    providers: [importProvidersFrom(FormsModule)],
  });
}
```

- [ ] **Step 3: Aggiungi la configuration `demo` in `angular.json` e lo script npm**

Nel target `serve` (o `build`, a seconda della struttura generata da `ng new` nello Step 1 del Task 1), aggiungi una configuration `demo` che usa `src/main.demo.ts` come entry point invece di `src/main.ts` (crea `src/main.demo.ts` con `(window as any).__WM_ELEMENTS_DEMO__ = true;` seguito dallo stesso import/bootstrap dello Step 2, così l'entry point di produzione resta pulito senza il flag globale).

In `package.json`:

```json
{
  "scripts": {
    "start:demo": "ng serve --configuration=demo"
  }
}
```

- [ ] **Step 4: Verifica hot reload**

```bash
npm run start:demo
```

Apri `http://localhost:4200`, modifica un testo in `demo.component.html` (es. l'etichetta di un input) e verifica che il browser si aggiorni automaticamente in 1-2 secondi senza refresh manuale.

- [ ] **Step 5: Commit**

```bash
git add src/app/demo src/main.demo.ts angular.json package.json
git commit -m "feat(oc:8252): add demo dev app with live-reload for day-to-day development"
```

---

### Task 3: Ispezione dipendenze componenti riusati (routing, Ionic runtime)

Questo task è il prerequisito bloccante identificato in Fase: challenge — va eseguito e documentato prima di scrivere qualunque componente applicativo.

**Files:**
- Create: `docs/features/8252-wm-layer-map-angular/notes.md` (sezione "Dipendenze componenti riusati")

**Interfaces:**
- Consumes: nessuno
- Produces: elenco documentato di tag Ionic da caricare nello shadow root, conferma della strategia `UrlHandlerService` (vedi Task 4)

- [ ] **Step 1: Documenta i componenti target e le loro dipendenze già note**

Scrivi in `notes.md`:

```markdown
## Dipendenze componenti riusati

- `wm-slope-chart` (`@wm-core/slope-chart/slope-chart.component`): nessuna dipendenza da routing. `@Input() currentTrack: WmFeature<LineString>`, `@Output('hover') hover`. Import diretto, nessuno store richiesto per funzionare (solo per l'hover cross-component se serve sincronizzare con track-properties).
- `wm-track-properties` (`@wm-core/track-properties/track-properties.component`): NESSUN @Input — completamente store-driven (selectors `currentEcTrack`, `currentEcTrackProperties`, `ecLayer`, `chartHoverElements`, `flowLineQuoteText`). Inietta `UrlHandlerService` (usato in `close()`) e `LangService`.
- `wm-track-related-poi` (`@wm-core/track-related-poi/track-related-poi.component`): NESSUN @Input — store-driven (`currentEcRelatedPoiId`, `currentEcRelatedPois`, `currentEcTrackProperties`). `@Output('poi-click')`. Inietta `UrlHandlerService.updateURL()` in `selectPoi()` per cambiare il POI selezionato, e `GeolocationService`.
- `UrlHandlerService` (`@wm-core/services/url-handler.service`): richiede `ActivatedRoute` e `Router` reali nel costruttore. `initialize()` sottoscrive `_route.queryParams` e dispatcha `currentEcLayerId`/`currentEcTrackId`/`currentEcPoiId`/`currentEcRelatedPoiId` allo store. Vedi Task 4 per lo shim.
```

- [ ] **Step 2: Grep tag Ionic nei template dei componenti riusati**

```bash
cd ~/Documents/wm-elements/src/app/shared/wm-core/projects/wm-core/src
grep -rlE "<ion-[a-z-]+" slope-chart track-properties track-related-poi
```

Per ogni file trovato, annota in `notes.md` sotto una sezione `### Tag Ionic da caricare`:

```markdown
### Tag Ionic da caricare

<!-- popolare con l'output effettivo del grep, es.: -->
<!-- track-properties.component.html: <ion-icon>, <ion-button> -->
```

- [ ] **Step 3: Grep variabili CSS Ionic nei relativi file scss**

```bash
grep -rhoE "var\(--ion-[a-zA-Z0-9-]+" slope-chart track-properties track-related-poi | sort -u
```

Annota l'elenco in `notes.md` sotto `### Custom properties Ionic da portare nello shadow root` — questo elenco alimenta direttamente il Task 10 (Shadow DOM + theming).

- [ ] **Step 4: Commit**

```bash
git add docs/features/8252-wm-layer-map-angular/notes.md
git commit -m "docs(oc:8252): document reused component dependencies (routing, Ionic tags/vars)"
```

---

### Task 4: Shim di `UrlHandlerService` senza Router reale

**Files:**
- Create: `src/app/services/local-url-handler.service.ts`
- Modify: modulo root del componente (provider override, vedi Task 5)

**Interfaces:**
- Consumes: nessuno (sostituisce interamente `UrlHandlerService` di `wm-core` tramite DI override)
- Produces: `LocalUrlHandlerService` con TUTTI e 6 i metodi effettivamente chiamati in `wm-core` (verificato con grep su tutto il submodule, non solo sui 3 componenti riusati nella UI — perché montiamo lo store/effects per intero e `store/user-activity/user-activity.effects.ts` inietta `UrlHandlerService` a sua volta): `updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`, più `getCurrentQueryParams` — consumato dal provider override nel Task 5 (`{provide: UrlHandlerService, useClass: LocalUrlHandlerService}`)

> **Nota bloccante emersa in revisione:** un grep iniziale su tutto `wm-core` (non solo sui 3 componenti ispezionati nel Task 3) ha rivelato 6 metodi usati, non 2, e 18 file totali che iniettano `UrlHandlerService` — incluso `user-activity.effects.ts`, un effect NgRx che gira sempre perché montiamo tutti gli effects (decisione di challenge). I 3 metodi mancanti nella prima bozza (`changeURL`, `resetURL`, `removeLatest`) sono innescati in quell'effect solo da action di feature fuori scope per noi (`backOfMapDetails`, chiusura UGC, `checkCurrentUgcTrack`) che il widget non dispatcha mai — ma vanno comunque implementati (anche solo come no-op sicuri) per non lasciare `undefined` che crasha se in futuro qualcosa li innesca inavvertitamente.

- [ ] **Step 1: Crea lo shim con tutti i 6 metodi**

```typescript
// src/app/services/local-url-handler.service.ts
import {Injectable} from '@angular/core';
import {Store} from '@ngrx/store';
import {BehaviorSubject} from 'rxjs';
import {Params} from '@angular/router';
import {
  currentEcLayerId,
  currentEcTrackId,
  currentEcPoiId,
  currentEcRelatedPoiId,
} from '@wm-core/store/features/ec/ec.actions';
import {closeUgc, closeDownloads} from '@wm-core/store/user-activity/user-activity.action';

const EMPTY_PARAMS: Params = {
  track: undefined,
  poi: undefined,
  ugc_track: undefined,
  ugc_poi: undefined,
  ec_related_poi: undefined,
  gallery_index: undefined,
  layer: undefined,
};

@Injectable()
export class LocalUrlHandlerService {
  private _params$: BehaviorSubject<Params> = new BehaviorSubject<Params>({});

  constructor(private _store: Store) {}

  getCurrentQueryParams(): Params {
    return this._params$.value;
  }

  updateURL(queryParams: Params, _routes: string[] = []): void {
    const merged = {...EMPTY_PARAMS, ...this._params$.value, ...queryParams};
    this._params$.next(merged);
    this._dispatchFromParams(merged);
  }

  changeURL(_route: string, queryParams: Params = this.getCurrentQueryParams()): void {
    // Nel widget non esiste un vero routing tra "pagine": changeURL collassa su un
    // aggiornamento dei soli query param, senza navigazione reale.
    this.updateURL(queryParams);
  }

  resetURL(): void {
    this._store.dispatch(closeUgc());
    this._store.dispatch(closeDownloads());
    this._params$.next({...EMPTY_PARAMS});
    this._dispatchFromParams(EMPTY_PARAMS);
  }

  setPoi(id: string | number): void {
    this.updateURL({poi: id ? id : undefined, ugc_poi: undefined});
  }

  setTrack(id: string | number): void {
    this.updateURL({track: id ? id : undefined});
  }

  removeLatest(): boolean {
    const p = this.getCurrentQueryParams();
    if (p.gallery_index != null) {
      this.updateURL({gallery_index: undefined});
      return false;
    } else if (p.ec_related_poi != null) {
      this.updateURL({ec_related_poi: undefined});
      return false;
    } else if (p.layer != null && (p.poi != null || p.track != null)) {
      this.updateURL({poi: undefined, track: undefined});
      return false;
    } else if (p.ugc_track != null || p.ugc_poi != null) {
      this.updateURL({ugc_track: undefined, ugc_poi: undefined});
      return false;
    } else {
      this.resetURL();
      return true;
    }
  }

  private _dispatchFromParams(params: Params): void {
    this._store.dispatch(currentEcLayerId({currentEcLayerId: params.layer ?? null}));
    this._store.dispatch(currentEcTrackId({currentEcTrackId: params.track ?? null}));
    this._store.dispatch(currentEcPoiId({currentEcPoiId: params.poi ?? null}));
    this._store.dispatch(
      currentEcRelatedPoiId({currentRelatedPoiId: params.ec_related_poi ?? null}),
    );
  }
}
```

- [ ] **Step 2: Verifica che nessun'altra chiamata a `UrlHandlerService` sia rimasta scoperta**

```bash
cd ~/Documents/wm-elements/src/app/shared/wm-core/projects/wm-core/src
grep -rhoE "_urlHandlerSvc\.[a-zA-Z]+\(|urlHandlerSvc\.[a-zA-Z]+\(" . --include="*.ts" | sort -u
```

Confronta l'output con i 6 metodi implementati nello Step 1 (`updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`) più `getCurrentQueryParams`. Se emerge un metodo nuovo non coperto, aggiungilo con la stessa firma dell'originale (leggi `@wm-core/services/url-handler.service.ts` per il comportamento) prima di procedere — non lasciare mai un metodo mancante, anche se il suo trigger sembra fuori scope oggi.

- [ ] **Step 3: Verifica compilazione**

```bash
cd ~/Documents/wm-elements
npx tsc --noEmit -p tsconfig.app.json
```

Expected: nessun errore di tipo su `LocalUrlHandlerService`.

- [ ] **Step 4: Commit**

```bash
git add src/app/services/local-url-handler.service.ts
git commit -m "feat(oc:8252): add LocalUrlHandlerService shim without real Router dependency"
```

---

### Task 5: Store isolato (montato per intero) + provider override

**Files:**
- Create: `src/app/wm-layer-map/wm-layer-map.module.ts` (o standalone providers array se il progetto usa componenti standalone-only — verifica in Step 1)
- Modify: `src/main.ts` (bootstrap del custom element)

**Interfaces:**
- Consumes: `LocalUrlHandlerService` (Task 4), reducer/effects esportati da `wm-core` (da individuare in Step 1)
- Produces: `injector` Angular pronto, iniettato in `createCustomElement(WmLayerMapComponent, {injector})` — consumato dal Task 6

- [ ] **Step 1: Individua i reducer/effects esportati da wm-core da montare integralmente**

```bash
cd ~/Documents/wm-elements/src/app/shared/wm-core/projects/wm-core/src
grep -rl "StoreModule.forRoot\|StoreModule.forFeature\|EffectsModule.forRoot\|EffectsModule.forFeature" --include="*.ts" . | grep -v spec
```

Annota in `docs/features/8252-wm-layer-map-angular/notes.md` (sezione "Store montato") l'elenco dei moduli/reducer/effects trovati — questi vanno tutti registrati nel bootstrap, non un sottoinsieme.

- [ ] **Step 2: Crea il bootstrap dell'injector**

```typescript
// src/main.ts
import {createApplication} from '@angular/platform-browser';
import {createCustomElement} from '@angular/elements';
import {provideStore} from '@ngrx/store';
import {provideEffects} from '@ngrx/effects';
import {UrlHandlerService} from '@wm-core/services/url-handler.service';
import {LocalUrlHandlerService} from './app/services/local-url-handler.service';
import {WmLayerMapComponent} from './app/wm-layer-map/wm-layer-map.component';
// import qui i reducer/effects individuati nello Step 1, es.:
// import {ecReducer} from '@wm-core/store/features/ec/ec.reducer';
// import {EcEffects} from '@wm-core/store/features/ec/ec.effects';

(async () => {
  const app = await createApplication({
    providers: [
      provideStore({
        // conf: confReducer, ec: ecReducer, userActivity: userActivityReducer, ... (elenco completo da Step 1)
      }),
      provideEffects([
        // EcEffects, UserActivityEffects, ... (elenco completo da Step 1)
      ]),
      {provide: UrlHandlerService, useClass: LocalUrlHandlerService},
    ],
  });

  const wmLayerMapElement = createCustomElement(WmLayerMapComponent, {
    injector: app.injector,
  });
  customElements.define('wm-layer-map', wmLayerMapElement);
})();
```

- [ ] **Step 3: Verifica che il custom element si registri senza errori**

```bash
npx ng build
```

Expected: build ok. `WmLayerMapComponent` non esiste ancora — crealo come shell vuota temporanea per questo step:

```typescript
// src/app/wm-layer-map/wm-layer-map.component.ts
import {Component, ViewEncapsulation} from '@angular/core';

@Component({
  selector: 'app-wm-layer-map-root',
  template: '<div>wm-layer-map placeholder</div>',
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class WmLayerMapComponent {}
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8252): bootstrap isolated injector with full wm-core store and UrlHandlerService override"
```

---

### Task 6: Attributi, config fetch, fit bbox, layer raster+PBF

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`
- Create: `src/app/wm-layer-map/wm-layer-map-config.service.ts`

**Interfaces:**
- Consumes: nessuno (fetch diretto verso gli URL pattern documentati)
- Produces: `WmLayerMapConfigService.loadConfig(shard: string, appId: string): Promise<{layers: any[]}>`, `WmLayerMapConfigService.findLayer(config, layerId: string): any | null` — consumati dal componente in Step 2 e dal Task 11 (badge/CTA)

- [ ] **Step 1: Crea il servizio di config, replicando i pattern URL del widget attuale**

```typescript
// src/app/wm-layer-map/wm-layer-map-config.service.ts
import {Injectable} from '@angular/core';

export interface WmLayerMapLayer {
  id: number;
  bbox?: [number, number, number, number];
  [key: string]: any;
}

export interface WmLayerMapConfig {
  layers: WmLayerMapLayer[];
  [key: string]: any;
}

@Injectable({providedIn: 'root'})
export class WmLayerMapConfigService {
  async loadConfig(shard: string, appId: string): Promise<WmLayerMapConfig> {
    const url = `https://wmfe.s3.eu-central-1.amazonaws.com/${shard}/${appId}/config.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`config fetch failed: ${response.status}`);
    }
    return response.json();
  }

  findLayer(config: WmLayerMapConfig, layerId: string): WmLayerMapLayer | null {
    const id = Number(layerId);
    return config.layers.find(layer => layer.id === id) ?? null;
  }

  tilesRasterUrl(): string {
    return 'https://api.webmapp.it/tiles/{z}/{x}/{y}.png';
  }

  tilesPbfUrl(shard: string, appId: string): string {
    return `https://wmfe.s3.eu-central-1.amazonaws.com/${shard}/${appId}/pbf/{z}/{x}/{y}.pbf`;
  }

  trackDetailUrl(shard: string, trackId: string | number): string {
    return `https://wmfe.s3.eu-central-1.amazonaws.com/${shard}/tracks/${trackId}.json`;
  }
}
```

- [ ] **Step 2: Cablare il componente per leggere gli attributi e usare il servizio**

```typescript
// src/app/wm-layer-map/wm-layer-map.component.ts
import {Component, Input, OnInit, ViewEncapsulation, EventEmitter, Output} from '@angular/core';
import {WmLayerMapConfigService, WmLayerMapLayer} from './wm-layer-map-config.service';

@Component({
  selector: 'app-wm-layer-map-root',
  templateUrl: './wm-layer-map.component.html',
  styleUrls: ['./wm-layer-map.component.scss'],
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class WmLayerMapComponent implements OnInit {
  @Input() shard!: string;
  @Input('app-id') appId!: string;
  @Input('layer-id') layerId!: string;

  @Output() ready = new EventEmitter<{layer: WmLayerMapLayer}>();
  @Output() error = new EventEmitter<{message: string}>();

  layer: WmLayerMapLayer | null = null;
  rasterUrl = '';
  pbfUrl = '';

  constructor(private _configSvc: WmLayerMapConfigService) {}

  async ngOnInit(): Promise<void> {
    try {
      const config = await this._configSvc.loadConfig(this.shard, this.appId);
      this.layer = this._configSvc.findLayer(config, this.layerId);
      if (!this.layer) {
        throw new Error(`layer ${this.layerId} not found`);
      }
      this.rasterUrl = this._configSvc.tilesRasterUrl();
      this.pbfUrl = this._configSvc.tilesPbfUrl(this.shard, this.appId);
      this.ready.emit({layer: this.layer});
    } catch (e) {
      this.error.emit({message: (e as Error).message});
    }
  }
}
```

Nota: gli `@Input`/`@Output` con Angular Elements diventano automaticamente attributi HTML kebab-case ed eventi DOM `CustomEvent` — `app-id`/`layer-id` già mappano correttamente su `appId`/`layerId` grazie all'alias esplicito passato a `@Input('app-id')`.

- [ ] **Step 3: Verifica manuale con pagina di test minimale**

Crea `test/index.html`:

```html
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>wm-layer-map test</title></head>
<body>
  <wm-layer-map
    shard="camminiditalia"
    app-id="1"
    layer-id="117"
    style="display:block;width:100%;height:600px"
  ></wm-layer-map>
  <script type="module" src="../dist/wm-elements/main.js"></script>
  <script>
    document.querySelector('wm-layer-map').addEventListener('ready', e => console.log('ready', e.detail));
    document.querySelector('wm-layer-map').addEventListener('error', e => console.error('error', e.detail));
  </script>
</body>
</html>
```

```bash
npx ng build
npx http-server . -p 8080
```

Apri `http://localhost:8080/test/index.html`, verifica in console l'evento `ready` con il layer trovato (o `error` se il layer-id non esiste — usa un id noto valido preso da `wm-webapp` o dal test del vecchio widget).

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map-config.service.ts src/app/wm-layer-map/wm-layer-map.component.ts test/index.html
git commit -m "feat(oc:8252): fetch config, resolve layer, emit ready/error events"
```

---

### Task 7: Mappa OpenLayers (fit bbox, layer raster+PBF, click traccia) via map-core

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`, `wm-layer-map.component.ts`

**Interfaces:**
- Consumes: direttive di `map-core` (`wmMap` o equivalente base directive, `wmMapLayer`/`wmMapPois` — nomi esatti da confermare leggendo `map-core/src/directives/layer.directive.ts` e `pois.directive.ts` prima di scrivere il template), `WmLayerMapConfigService` (Task 6)
- Produces: evento `(track-selected)` sul componente root, riusato dal Task 9 per popolare il pannello dettaglio

- [ ] **Step 1: Leggi le API esatte delle direttive map-core da riusare**

```bash
cd ~/Documents/wm-elements/src/app/shared/map-core/src/directives
sed -n '1,60p' layer.directive.ts
sed -n '1,60p' track.directive.ts
```

Annota in `notes.md` (sezione "API direttive map-core") il selettore esatto e gli `@Input`/`@Output` di ciascuna — usali letteralmente nel template dello Step 2 (non inventare nomi).

- [ ] **Step 2: Cablare il template mappa usando le direttive individuate**

Scrivi `wm-layer-map.component.html` seguendo la convenzione di ordine attributi documentata in `map-core/CLAUDE.md` (input condivisi prima del selettore di direttiva, input dedicati dopo), usando i nomi esatti annotati nello Step 1. Passa `this.layer.bbox` per il fit iniziale e gli URL da `WmLayerMapConfigService` per i layer raster/PBF.

- [ ] **Step 3: Aggiungi l'evento di click traccia**

Nel componente, sottoscrivi l'output di click-feature della direttiva individuata, estrai l'id traccia dalle properties, fetcha il dettaglio con `WmLayerMapConfigService.trackDetailUrl(...)`, emetti `track-selected` con l'id.

- [ ] **Step 4: Verifica manuale**

```bash
npx ng build && npx http-server .
```

Apri `test/index.html`, verifica: la mappa si adatta al bbox del layer, le tracce sono visibili e cliccabili, in console appare l'evento `track-selected` al click.

- [ ] **Step 5: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8252): render map with raster+PBF layers, fit bbox, track click"
```

---

### Task 8: POI del layer (marker + dettaglio)

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`, `wm-layer-map.component.ts`

**Interfaces:**
- Consumes: direttiva POI di `map-core` (verifica selettore esatto in `map-core/src/directives/` — probabile `pois.directive.ts` o `track.related-pois.directive.ts` a seconda che i POI siano globali del layer o legati alla traccia corrente, da confermare leggendo il codice)
- Produces: nessuna nuova interfaccia pubblica — comportamento visivo (marker cliccabili)

- [ ] **Step 1: Determina se i POI del layer sono globali o legati alla traccia selezionata**

```bash
cd ~/Documents/wm-elements/src/app/shared/map-core/src/directives
sed -n '1,50p' pois.directive.ts
```

Annota in `notes.md` se questa direttiva richiede una lista POI passata come `@Input` (probabile, dato il pattern già documentato in `map-core/CLAUDE.md` — `wmMapPoisPois`) o se va combinata con dati recuperati dalla config/API del layer.

- [ ] **Step 2: Aggiungi la direttiva POI al template mappa**

Segui esattamente la convenzione di `map-core/CLAUDE.md` per l'ordine degli attributi (binding condivisi prima del selettore `wmMapPois`, binding dedicati dopo). Collega il click sul marker al componente `wm-track-related-poi` (o al pattern equivalente individuato) per aprire il pannello dettaglio POI.

- [ ] **Step 3: Verifica manuale**

Usa un `layer-id` di test con POI noti (verifica in `wm-webapp` quale layer ne ha, o consulta il DB/API di test). Apri `test/index.html`, verifica che i marker POI compaiano sulla mappa e che il click apra il dettaglio con lo stesso comportamento della webapp (nome, immagine, descrizione).

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8252): render layer POIs as markers with detail panel"
```

---

### Task 9: Pannello dettaglio traccia (dati tecnici, galleria, descrizione, slope chart)

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`, `wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `wm-track-properties`, `wm-slope-chart` (`[currentTrack]`), `wm-track-related-poi` (Task 3), azioni store `ec` (`currentEcTrackId` via `LocalUrlHandlerService`, Task 4)
- Produces: nessuna nuova interfaccia pubblica

- [ ] **Step 1: Al ricevere `track-selected` (Task 7), dispatcha la selezione tramite `LocalUrlHandlerService`**

```typescript
onTrackSelected(trackId: string): void {
  this._localUrlHandlerSvc.updateURL({track: trackId});
}
```

(inietta `LocalUrlHandlerService` nel costruttore del componente root)

- [ ] **Step 2: Fetch del dettaglio traccia e popolamento store `ec`**

Verifica in `@wm-core/store/features/ec/ec.actions.ts` quale action popola `currentEcTrack`/`currentEcTrackProperties` (i selettori consumati da `wm-track-properties`, Task 3) — dispatchala con il JSON ottenuto da `WmLayerMapConfigService.trackDetailUrl(...)`.

- [ ] **Step 3: Aggiungi i componenti al template**

```html
<div class="panel" part="panel" [class.open]="layer && selectedTrackId">
  <button part="panel-close" (click)="closePanel()">✕</button>
  <wm-track-properties></wm-track-properties>
  <wm-slope-chart [currentTrack]="currentTrackForChart"></wm-slope-chart>
  <wm-track-related-poi (poi-click)="onRelatedPoiClick($event)"></wm-track-related-poi>
</div>
```

`currentTrackForChart` è lo stesso `WmFeature<LineString>` dispatchato allo store nello Step 2 — tienilo in un campo del componente per il binding diretto a `wm-slope-chart` (che, a differenza di `wm-track-properties`, richiede l'`@Input` esplicito).

- [ ] **Step 4: Verifica manuale**

Click su una traccia (Task 7): il pannello si apre con dati tecnici, galleria, descrizione e grafico altimetrico popolati correttamente, coerenti con quanto mostrato dalla stessa traccia nella webapp.

- [ ] **Step 5: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8252): wire track detail panel with slope chart and related POIs"
```

---

### Task 10: Shadow DOM theming (CSS custom properties, Ionic vars, CSS Parts)

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.scss`, `wm-layer-map.component.html`

**Interfaces:**
- Consumes: elenco variabili Ionic da Task 3 Step 3
- Produces: nessuna nuova interfaccia — contratto di theming pubblico (CSS custom properties + `::part()`) verificato manualmente

- [ ] **Step 1: Definisci i default delle custom properties pubbliche**

```scss
// wm-layer-map.component.scss
:host {
  --wm-color-primary: #{'#2f6f4f'};
  --wm-color-dark: #{'#1f2937'};
  --wm-color-light: #{'#ffffff'};
  --wm-color-light-rgb: 255, 255, 255;
  --wm-font-sm: 0.875rem;
  --wm-font-family: 'Montserrat', sans-serif;
  --wm-panel-width: 360px;
  --wm-control-size: 32px;
  --wm-surface-radius: 12px;
  --wm-surface-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  // default locali per le variabili Ionic annotate in notes.md (Task 3, Step 3) —
  // popolare con l'elenco effettivo trovato dal grep, es.:
  // --ion-color-primary: var(--wm-color-primary);
  display: block;
}
```

- [ ] **Step 2: Applica `part="..."` agli elementi del template secondo l'elenco CSS Parts del contratto pubblico**

Verifica che ogni elemento del template (`map-wrap`, `top-bar`, `app-link`, `store-links`, `layer-badge`, `bottom-left`, `scale-line`, `map`, `attribution`, `panel`, `panel-close`, `panel-title`) abbia l'attributo `part` corrispondente, replicando 1:1 l'elenco del widget attuale (`test/wm-layer-map` clonato, sezione README "CSS Parts").

- [ ] **Step 3: Verifica manuale del theming**

In `test/index.html` aggiungi:

```html
<style>
  wm-layer-map {
    --wm-color-primary: #d1004b;
    --wm-panel-width: 420px;
  }
  wm-layer-map::part(panel) {
    border-left: 1px solid rgba(0, 0, 0, 0.08);
  }
</style>
```

Verifica che il colore primario e la larghezza del pannello cambino visivamente, e che il bordo custom sul part `panel` sia applicato.

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.scss src/app/wm-layer-map/wm-layer-map.component.html
git commit -m "feat(oc:8252): theming via CSS custom properties and CSS Parts, port Ionic vars into shadow root"
```

---

### Task 11: Badge app/CTA e badge store

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`, `wm-layer-map.component.ts`
- Create: `src/assets/store-badges/app-store-badge-en.png`, `src/assets/store-badges/google-play-badge-en.png` (copiati dal repo `wm-layer-map` clonato, stessa licenza/asset)

**Interfaces:**
- Consumes: attributi `cta-label`, `cta-url`, `app-icon-url`, `ios-store-url`, `android-store-url`, `hide-cta` (già dichiarati come `@Input` da aggiungere qui)

- [ ] **Step 1: Copia gli asset badge dal repo di riferimento**

```bash
cp /private/tmp/claude-501/-Users-bongiu-Documents-wm-webapp-src-app/ba938dd0-3bd9-49e3-a27d-9eebb2a80887/scratchpad/wm-layer-map/assets/store-badges/*.png ~/Documents/wm-elements/src/assets/store-badges/
cp /private/tmp/claude-501/-Users-bongiu-Documents-wm-webapp-src-app/ba938dd0-3bd9-49e3-a27d-9eebb2a80887/scratchpad/wm-layer-map/assets/branding/default-icon-fallback.png ~/Documents/wm-elements/src/assets/branding/
```

- [ ] **Step 2: Aggiungi gli `@Input` opzionali e il markup badge**

```typescript
@Input('cta-label') ctaLabel?: string;
@Input('cta-url') ctaUrl?: string;
@Input('app-icon-url') appIconUrl?: string;
@Input('ios-store-url') iosStoreUrl?: string;
@Input('android-store-url') androidStoreUrl?: string;
@Input('hide-cta') hideCta?: string;
```

```html
<div id="map-top-bar-left" part="app-link" *ngIf="hideCta === undefined">
  <a [href]="ctaUrl ?? defaultAppUrl" target="_blank">
    <img [src]="appIconUrl ?? '/assets/branding/default-icon-fallback.png'" alt="" />
    <span>{{ ctaLabel ?? layer?.title }}</span>
  </a>
</div>
<div id="map-top-bar-right" part="layer-badge">{{ layer?.title }}</div>
<div id="map-bottom-left" part="bottom-left" *ngIf="hideCta === undefined">
  <a part="store-links" [href]="iosStoreUrl ?? defaultIosUrl" target="_blank">
    <img src="/assets/store-badges/app-store-badge-en.png" alt="App Store" />
  </a>
  <a part="store-links" [href]="androidStoreUrl ?? defaultAndroidUrl" target="_blank">
    <img src="/assets/store-badges/google-play-badge-en.png" alt="Google Play" />
  </a>
</div>
```

`defaultAppUrl`/`defaultIosUrl`/`defaultAndroidUrl` calcolati da `shard`/`app-id` — replica esattamente la stessa logica del widget attuale (leggi `_computeDefaultUrls` o equivalente in `wm-layer-map.js` del repo clonato prima di scrivere).

- [ ] **Step 3: Verifica manuale**

In `test/index.html`, prova sia con `hide-cta` presente (badge/CTA nascosti, layer-badge visibile) sia assente (tutto visibile), desktop e mobile (resize finestra).

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts src/assets
git commit -m "feat(oc:8252): add app/store badges and CTA with hide-cta support"
```

---

### Task 12: Pipeline di distribuzione (branch dist + tag)

**Files:**
- Create: `~/Documents/wm-elements/scripts/publish-dist.sh`

**Interfaces:**
- Consumes: output di `ng build` (Task 1, 3-11)
- Produces: branch `dist` pubblicato, tag `dist-YYYYMMDD-HHmm`

- [ ] **Step 1: Crea lo script di pubblicazione manuale**

```bash
#!/usr/bin/env bash
set -euo pipefail

npx ng build --configuration production

TAG="dist-$(date +%Y%m%d-%H%M)"

git worktree add /tmp/wm-elements-dist dist 2>/dev/null || (git branch dist && git worktree add /tmp/wm-elements-dist dist)
rm -rf /tmp/wm-elements-dist/*
cp -r dist/wm-elements/* /tmp/wm-elements-dist/
cd /tmp/wm-elements-dist
git add -A
git commit -m "chore(oc:8252): publish dist bundle ($TAG)"
git tag "$TAG"
git push origin dist
git push origin "$TAG"
git worktree remove /tmp/wm-elements-dist
```

- [ ] **Step 2: Rendi eseguibile e documenta nel README**

```bash
chmod +x scripts/publish-dist.sh
```

Aggiungi in `README.md` (nuovo file, da creare) l'URL jsDelivr finale:

```
https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/main.js
```

(verifica il nome file bundle effettivo generato da `ng build` in `dist/wm-elements/`, potrebbe non chiamarsi `main.js` — usa il nome reale)

- [ ] **Step 3: Verifica manuale end-to-end**

Esegui `./scripts/publish-dist.sh` (richiede `origin` già configurato su GitHub — se il repo non è ancora stato pushato, chiedi conferma esplicita all'utente prima di creare il repo remoto e fare il primo push, come da regola generale azioni rischiose). Verifica che il branch `dist` e il tag esistano su GitHub, e che l'URL jsDelivr serva il file (può richiedere qualche minuto per la prima propagazione).

- [ ] **Step 4: Commit (nel repo principale, non nel worktree dist)**

```bash
git add scripts/publish-dist.sh README.md
git commit -m "feat(oc:8252): add manual dist publishing script with git tag rollback support"
```

---

## Self-Review (svolta durante la scrittura di questo piano)

**Spec coverage:**
- Repo/submodule/alias → Task 1, Task 2 (demo dev app) ✅
- Ispezione routing/Ionic → Task 3 ✅ (bloccante, primo dopo scaffold)
- Store integrale + no-URL → Task 4, 5 ✅
- Config/fit bbox/layer raster+PBF → Task 6, 7 ✅
- POI marker+dettaglio → Task 8 ✅
- Pannello dettaglio + slope chart → Task 9 ✅
- Shadow DOM + theming + CSS Parts → Task 10 ✅
- Badge/CTA → Task 11 ✅
- Pipeline dist + rollback via tag → Task 12 ✅
- Repo pubblico → Task 12 Step 3 (richiede push, conferma utente) ✅
- Verifica manuale sui 4 scenari (solo-tracce, tracce+POI, hide-cta, lingua non-IT) → distribuita nei task 6-11, va eseguita in sequenza completa a fine Task 11 come smoke test finale prima di Task 12.

**Nota lingua non italiana:** nessun task dedicato — l'attributo `lang` deve solo passare al `LangService` di `wm-core` (già usato da `wm-track-properties`). Aggiungere come ultimo step di verifica del Task 11: impostare `lang="en"` in `test/index.html` e confermare che le stringhe dei componenti riusati cambino lingua di conseguenza (se non cambiano, è un gap da annotare in `notes.md`, non bloccante per oggi dato l'out-of-scope su test automatici — ma da segnalare esplicitamente al dev).
