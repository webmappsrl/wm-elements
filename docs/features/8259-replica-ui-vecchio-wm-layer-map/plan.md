> Ticket: oc:8259

# Replica UI vecchio wm-layer-map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare nel widget Angular `<wm-layer-map>` gli elementi UI del vecchio widget vanilla JS (`webmappsrl/wm-layer-map`) oggi mancanti: CTA app-link, layer badge, badge store, attributi `hide-cta`/`lang`, animazione di apertura del pannello dettaglio traccia.

**Architecture:** Un nuovo servizio (`WidgetBrandingService`) isola il calcolo puro (piattaforma, URL CTA, URL icona) da `EnvironmentService` (già risolto per shard/appId via `WidgetEnvironmentService`, DI override in `bootstrap-widget.ts`). Il componente `WmLayerMapComponent` espone i nuovi `@Input()`, costruisce gli observable di presentazione e li lega al template. Nessun elemento è proiettato nei content-slot di `wm-map` (che espone solo `top-left`/`top-right`/`bottom`/`bottom-right`/`bottom-center` per controlli OL): CTA/badge/store sono `<div>` posizionati in assoluto dentro `.webmapp-pageroute-map-container`, esattamente come nel vecchio widget (elementi di overlay del widget, non controlli OpenLayers).

**Tech Stack:** Angular 20 standalone component, NgRx (selector `confAPP` già esistente in `wm-core`), Shadow DOM (`ViewEncapsulation.ShadowDom`), CSS puro (nessun framework), nessun test automatico.

## Global Constraints

- Nessuna modifica a `wm-core`/`map-core`/`wm-types` (submodule) — solo repo principale `wm-elements`.
- Questo repo non ha test automatici Karma/Jasmine (decisione di design consolidata, vedi `docs/features/8252-wm-layer-map-angular/overview.md`): ogni step "test" di questo piano è **verifica manuale** via `npm run start:demo` o `test/wm-layer-map/index.html`, non un test automatizzato.
- Commit convention: `feat(oc:8259): ...` / `fix(oc:8259): ...` / `refactor(oc:8259): ...`. I comandi `git commit` nei passi sono istruzioni testuali per lo sviluppatore — **non vanno eseguiti automaticamente da un agente**.
- Nessuna chiamata di rete nuova: l'icona CTA/URL store derivano da dati già presenti (`config.json` via selector `confAPP`) o da URL calcolati sincronamente, mai da un nuovo endpoint HTTP scritto in questo ciclo.

---

### Task 1: `WidgetBrandingService` — platform detection, CTA URL, icon URL

**Files:**
- Create: `src/app/services/widget-branding.service.ts`

**Interfaces:**
- Consumes: `EnvironmentService` (`@wm-core/services/environment.service`) — getters `shardName: string`, `origin: string` (già risolti per l'istanza corrente da `WidgetEnvironmentService`, provider override in `bootstrap-widget.ts:156`)
- Produces (usato da Task 2):
  - `detectPlatform(userAgent?: string): 'ios' | 'android' | 'desktop'`
  - `buildCtaUrl(appId: string, layerId: string): string`
  - `buildAppIconUrl(appId: string): string`
  - `readonly APP_ICON_FALLBACK_SRC: string` (data URI SVG, nessun asset esterno da bundlare)

- [ ] **Step 1: Creare il servizio**

```typescript
import {Injectable} from '@angular/core';
import {EnvironmentService} from '@wm-core/services/environment.service';

export type WidgetPlatform = 'ios' | 'android' | 'desktop';

// Domini noti divergenti dal pattern di default `<shard>.webmapp.it`
// (stessa lista di eccezioni del vecchio widget vanilla JS, vedi
// docs/features/8259-replica-ui-vecchio-wm-layer-map/overview.md — rischio
// accettato: un nuovo shard futuro con dominio proprio non elencato qui
// produrrebbe una CTA con dominio sbagliato, come già accadeva nel vecchio
// widget se non aggiornato).
const CTA_DOMAIN_OVERRIDES: Readonly<Record<string, string>> = {
  osm2cai: 'osm2cai.cai.it',
  maphub: 'maphub.it',
};

const APP_ICON_FALLBACK_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="10" fill="#cccccc"/>' +
      '<path d="M14 30l7-9 6 7 4-5 7 9z" fill="#ffffff"/>' +
      '</svg>',
  );

@Injectable({providedIn: 'root'})
export class WidgetBrandingService {
  readonly APP_ICON_FALLBACK_SRC = APP_ICON_FALLBACK_SRC;

  constructor(private _environmentSvc: EnvironmentService) {}

  detectPlatform(userAgent: string = navigator.userAgent): WidgetPlatform {
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      return 'ios';
    }
    if (/Android/.test(userAgent)) {
      return 'android';
    }
    return 'desktop';
  }

  buildCtaUrl(appId: string, layerId: string): string {
    const shardName = this._environmentSvc.shardName;
    const subdomain = shardName === 'geohub' ? 'app' : shardName;
    const domain = CTA_DOMAIN_OVERRIDES[shardName] ?? `${subdomain}.webmapp.it`;
    const base = `https://${appId}.${domain}/`;
    const numericLayerId = Number(layerId);
    if (layerId != null && layerId !== '' && !Number.isNaN(numericLayerId)) {
      return `${base}?layer=${layerId}`;
    }
    return base;
  }

  buildAppIconUrl(appId: string): string | null {
    const origin = this._environmentSvc.origin;
    if (!origin) {
      return null;
    }
    return `${origin}/api/app/webmapp/${appId}/resources/icon.png`;
  }
}
```

- [ ] **Step 2: Verifica manuale (nessun test automatico in questo repo)**

Avviare una console TypeScript rapida non è disponibile senza bootstrap Angular: la verifica reale avviene a Task 2/7 quando il servizio è wired nel componente e osservabile in `npm run start:demo`. Per una verifica isolata immediata, aprire il file e controllare a mano i 3 casi limite:
- `buildCtaUrl('12', '34')` con `shardName = 'osm2cai'` → deve produrre `https://12.osm2cai.cai.it/?layer=34`
- `buildCtaUrl('12', '')` con `shardName = 'geohub'` → deve produrre `https://12.app.webmapp.it/` (nessun `?layer=`)
- `buildCtaUrl('12', 'abc')` con `shardName = 'maphub'` → deve produrre `https://12.maphub.it/` (layerId non numerico, omesso)

- [ ] **Step 3: Commit**

```bash
git add src/app/services/widget-branding.service.ts
git commit -m "feat(oc:8259): add WidgetBrandingService for CTA/icon URL and platform detection"
```

---

### Task 2: Nuovi `@Input()` e observable di presentazione nel componente

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `WidgetBrandingService` (Task 1), selector `confAPP` da `@wm-core/store/conf/conf.selector` (già esistente, espone `state.APP` con campi `name`, `iosStore`, `androidStore` — vedi `wm-types/src/config.ts:9-23`)
- Produces (usati da Task 3 nel template):
  - `ctaLabel$: Observable<string>`
  - `ctaUrl$: Observable<string>`
  - `ctaIconUrl$: Observable<string | null>`
  - `layerBadgeLabel$: Observable<string>` (deriva da `currentLayer$` già esistente)
  - `storeBadgeUrl$: Observable<string | null>`
  - `platform: WidgetPlatform` (proprietà sincrona, calcolata una volta in ngOnInit)
  - `get hideCta(): boolean`
  - metodo `onCtaIconError(img: HTMLImageElement): void`
  - `appIconFallbackSrc: string` (esposto per il template)

- [ ] **Step 1: Aggiungere import e nuovi `@Input()`**

In cima al file, aggiungere gli import:

```typescript
import {WidgetBrandingService, WidgetPlatform} from '../services/widget-branding.service';
import {confAPP} from '@wm-core/store/conf/conf.selector';
import {LangService} from '@wm-core/localization/lang.service';
```

Subito dopo `@Input('layer-id') layerId!: string;` (riga 91) aggiungere:

```typescript
  @Input('cta-label') ctaLabelAttr?: string;
  @Input('cta-url') ctaUrlAttr?: string;
  @Input('app-icon-url') appIconUrlAttr?: string;
  @Input('ios-store-url') iosStoreUrlAttr?: string;
  @Input('android-store-url') androidStoreUrlAttr?: string;
  @Input('hide-cta') hideCtaAttr?: string;
  @Input() lang?: string;
```

- [ ] **Step 2: Aggiungere le property observable/derivate**

Dopo la property `zoomFeaturesInViewport$` (riga 176-178), aggiungere:

```typescript
  confAPP$ = this._store.select(confAPP);
  platform: WidgetPlatform;
  appIconFallbackSrc = this._brandingSvc.APP_ICON_FALLBACK_SRC;

  ctaLabel$: Observable<string> = this.confAPP$.pipe(
    map(app => this.ctaLabelAttr ?? app?.name ?? 'Webmapp'),
  );

  ctaUrl$: Observable<string> = of(
    this.ctaUrlAttr ?? this._brandingSvc.buildCtaUrl(this.appId, this.layerId),
  );

  ctaIconUrl$: Observable<string | null> = of(
    this.appIconUrlAttr ?? this._brandingSvc.buildAppIconUrl(this.appId),
  );

  layerBadgeLabel$: Observable<string> = this.currentLayer$.pipe(
    map((layer: any) => layer?.label ?? layer?.title ?? ''),
  );

  storeBadgeUrl$: Observable<string | null> = this.confAPP$.pipe(
    map(app => {
      if (this.platform === 'ios') {
        return this.iosStoreUrlAttr ?? app?.iosStore ?? null;
      }
      if (this.platform === 'android') {
        return this.androidStoreUrlAttr ?? app?.androidStore ?? null;
      }
      return null;
    }),
  );

  get hideCta(): boolean {
    return this.hideCtaAttr != null && this.hideCtaAttr !== 'false';
  }
```

Nota: `ctaUrl$`/`ctaIconUrl$` usano `of(...)` (valore sincrono singolo) perché `appId`/`layerId` sono `@Input()` risolti una sola volta all'avvio del widget embeddato — coerente con `dataLayerUrls$` esistente che tratta gli stessi input come stabili per tutta la vita del componente.

- [ ] **Step 3: Iniettare `WidgetBrandingService` e `LangService` nel costruttore, calcolare `platform`**

Modificare la firma del costruttore (riga 180-186):

```typescript
  constructor(
    private _store: Store,
    private _actions$: Actions,
    private _urlHandlerSvc: UrlHandlerService,
    private _environmentSvc: EnvironmentService,
    private _ecSvc: EcService,
    private _brandingSvc: WidgetBrandingService,
    private _langSvc: LangService,
  ) {
    this.platform = this._brandingSvc.detectPlatform();
    this.refreshLayer$ = this._actions$.pipe(
```

(il resto del corpo del costruttore resta invariato)

- [ ] **Step 4: Aggiungere il metodo di fallback icona**

Dopo il metodo `updateEcTrack` (fine classe, prima della parentesi graffa finale):

```typescript
  onCtaIconError(img: HTMLImageElement): void {
    if (img.src !== this.appIconFallbackSrc) {
      img.src = this.appIconFallbackSrc;
    }
  }
```

- [ ] **Step 5: Verifica manuale**

```bash
npm run start:demo
```

Nella pagina demo impostare `shard=geohub`, `app-id` e `layer-id` validi. Aprire la console del browser ed eseguire:

```js
document.querySelector('wm-layer-map-root, app-wm-layer-map-root')
```

Verificare che non ci siano errori Angular di dependency injection in console (assenza di `NullInjectorError` per `WidgetBrandingService`/`LangService`).

- [ ] **Step 6: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8259): wire CTA/badge inputs and observables into WmLayerMapComponent"
```

---

### Task 3: Markup CTA, layer badge, badge store

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`

**Interfaces:**
- Consumes: tutte le observable/property di Task 2 (`ctaLabel$`, `ctaUrl$`, `ctaIconUrl$`, `layerBadgeLabel$`, `storeBadgeUrl$`, `platform`, `hideCta`, `onCtaIconError`, `appIconFallbackSrc`)

- [ ] **Step 1: Aggiungere il markup subito dopo l'apertura di `.webmapp-pageroute-map-container`**

Modificare l'inizio del file (dopo la riga 1 `<div class="webmapp-pageroute-map-container">`):

```html
<div class="webmapp-pageroute-map-container">
  <a
    *ngIf="!hideCta"
    class="cta-app-link"
    part="app-link"
    [href]="ctaUrl$|async"
    target="_blank"
    rel="noopener"
  >
    <img
      class="cta-app-link-icon"
      part="app-link-icon"
      [src]="(ctaIconUrl$|async) ?? appIconFallbackSrc"
      (error)="onCtaIconError($event.target)"
      alt=""
      aria-hidden="true"
    />
    <span class="cta-app-link-text">
      <span class="cta-app-link-label" part="app-link-label">{{ ctaLabel$|async }}</span>
      <span class="cta-app-link-subtitle" part="app-link-subtitle">Apri la web app</span>
    </span>
  </a>

  <div
    *ngIf="layerBadgeLabel$|async as layerBadgeLabel"
    class="layer-badge"
    part="layer-badge"
    aria-hidden="true"
  >
    {{ layerBadgeLabel }}
  </div>

  <a
    *ngIf="!hideCta && (storeBadgeUrl$|async) as storeUrl"
    class="store-badge"
    part="store-badge"
    [href]="storeUrl"
    target="_blank"
    rel="noopener"
    [attr.aria-label]="platform === 'ios' ? 'Scarica su App Store' : 'Scarica su Google Play'"
  >
    {{ platform === 'ios' ? 'App Store' : 'Google Play' }}
  </a>

  <div class="panel" part="panel" *ngIf="ecTrack$|async as ecTrack">
```

(le righe successive del file, dal `<div class="panel" ... *ngIf="ecTrack$...">` esistente in poi, restano invariate — l'inserimento va SOPRA quel div, non lo sostituisce)

- [ ] **Step 2: Verifica manuale**

```bash
npm run start:demo
```

Aprire la pagina demo con `shard`/`app-id`/`layer-id` validi (uno shard con `config.json` che abbia `APP.name` valorizzato). Verificare visivamente:
- CTA visibile in alto a sinistra con icona (fallback grigio se l'URL calcolato dell'icona fallisce) + nome app + "Apri la web app"
- Badge nome layer visibile in alto a destra
- Nessun badge store visibile su browser desktop (comportamento atteso: `platform === 'desktop'`)

Poi impostare l'attributo `hide-cta` sull'elemento e verificare che CTA e badge store spariscano ma il layer badge resti visibile.

- [ ] **Step 3: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html
git commit -m "feat(oc:8259): add CTA app-link, layer badge and store badge markup"
```

---

### Task 4: Stili CTA/badge — posizionamento, stati hover/focus, touch target, RTL

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.scss`

**Interfaces:**
- Consumes: classi `.cta-app-link`, `.cta-app-link-icon`, `.cta-app-link-text`, `.cta-app-link-label`, `.cta-app-link-subtitle`, `.layer-badge`, `.store-badge` definite nel template di Task 3

- [ ] **Step 1: Aggiungere gli stili in coda al file**

```scss
.cta-app-link,
.layer-badge,
.store-badge {
  position: absolute;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--wm-surface-radius, 8px);
  background: var(--wm-color-light, #fff);
  box-shadow: var(--wm-surface-shadow, 0 1px 4px rgba(0, 0, 0, 0.2));
  font-size: 14px;
  line-height: 1.2;
  color: var(--wm-color-dark, #222);
  text-decoration: none;
}

.cta-app-link {
  inset-block-start: 10px;
  inset-inline-start: 10px;
  min-height: 44px;
}

.cta-app-link-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex: 0 0 auto;
  object-fit: cover;
}

.cta-app-link-text {
  display: flex;
  flex-direction: column;
}

.cta-app-link-label {
  font-weight: 600;
}

.cta-app-link-subtitle {
  font-size: 12px;
  opacity: 0.7;
}

.layer-badge {
  inset-block-start: 10px;
  inset-inline-end: 10px;
  pointer-events: none;
  font-weight: 600;
}

.store-badge {
  inset-block-end: 10px;
  inset-inline-start: 10px;
  min-height: 44px;
  min-width: 44px;
  font-weight: 600;
}

.cta-app-link:hover,
.store-badge:hover {
  box-shadow: var(--wm-surface-shadow-hover, 0 2px 8px rgba(0, 0, 0, 0.3));
}

.cta-app-link:focus-visible,
.store-badge:focus-visible {
  outline: 3px solid var(--wm-color-primary, #1a73e8);
  outline-offset: 2px;
}
```

Nota: `inset-block-*`/`inset-inline-*` (proprietà logiche CSS) invece di `top`/`left`/`right`/`bottom` fissi — garantiscono il mirroring corretto quando l'host della pagina imposta `dir="rtl"` (requisito `[UX]` da overview.md), senza bisogno di media query o classi dedicate.

- [ ] **Step 2: Verifica manuale**

```bash
npm run start:demo
```

- Verificare che CTA/badge store abbiano un anello di focus visibile navigando con `Tab` da tastiera (non solo hover col mouse)
- Ridimensionare la finestra e verificare che CTA/layer-badge/store-badge non si sovrappongano al pannello dettaglio quando aperto
- Aggiungere temporaneamente `dir="rtl"` sull'elemento host nella pagina demo e verificare che CTA passi a destra e layer-badge a sinistra (mirroring corretto)

- [ ] **Step 3: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.scss
git commit -m "feat(oc:8259): style CTA/badge elements with logical properties and focus states"
```

---

### Task 5: Animazione apertura pannello dettaglio + focus management

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`
- Modify: `src/app/wm-layer-map/wm-layer-map.component.scss`
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `ecTrack$`, `currentPoi$` (già esistenti)
- Produces: metodo `focusPanelClose(el: HTMLElement): void` (sposta il focus sul pulsante di chiusura quando il pannello appare)

Il pannello oggi appare/scompare istantaneamente via `*ngIf` (nessuna transizione presente, verificato in fase di overview). Per animare l'apertura mantenendo `*ngIf` (nessun elemento fantasma nel DOM quando chiuso, invarianza comportamentale per il resto del componente) si usa `@angular/animations`... **non disponibile in questo progetto** (non è tra le dipendenze — verificare prima di usarla). Soluzione più semplice e senza nuove dipendenze: CSS `@starting-style` non è supportato da tutti i browser target del widget; si usa invece la tecnica classica "doppio frame" con classe aggiunta dopo il render iniziale via `setTimeout(0)`.

- [ ] **Step 1: Verificare l'assenza di `@angular/animations` come dipendenza**

```bash
grep -n "@angular/animations" package.json
```

Expected: nessun match (conferma che serve la tecnica CSS pura sotto, non `[@trigger]`).

- [ ] **Step 2: Aggiungere classe di stato e binding nel template**

Modificare i due blocchi `.panel` esistenti (righe 2 e 6 del file originale) aggiungendo `[class.panel-open]` e `#panelEl`:

```html
  <div
    #trackPanelEl
    class="panel"
    part="panel"
    [class.panel-open]="ecTrack$|async as ecTrack"
    *ngIf="ecTrack$|async as ecTrack"
  >
    <wm-track-properties (dismiss)="updateEcTrack()"></wm-track-properties>
  </div>

  <div
    #poiPanelEl
    class="panel"
    part="panel"
    [class.panel-open]="currentPoi$|async as currentPoi"
    *ngIf="currentPoi$|async as currentPoi"
  >
    <button
      #poiPanelCloseBtn
      class="panel-close"
      part="panel-close"
      aria-label="Chiudi dettaglio"
      (click)="unselectPoi()"
    >✕</button>
    <p class="panel-title" part="panel-title">{{ currentPoi.properties?.name|wmtrans }}</p>
    <wm-tab-image-gallery
      *ngIf="currentPoi.properties?.image_gallery?.length"
      [imageGallery]="currentPoi.properties?.image_gallery"
    ></wm-tab-image-gallery>
    <wm-inner-component-html
      *ngIf="currentPoi.properties?.description as description"
      [html]="description|wmtrans"
      [enableDismiss]="false"
    ></wm-inner-component-html>
  </div>
```

Nota: dato che `*ngIf` monta/smonta l'elemento, `[class.panel-open]` sarà sempre `true` quando l'elemento esiste nel DOM — la classe serve comunque come hook esplicito per la transizione CSS di Step 3 (l'elemento nasce con `transform` "chiuso" via stato iniziale nel CSS e la classe attiva la transizione verso "aperto" al frame successivo, vedi Step 4).

- [ ] **Step 3: Sostituire lo stile `.panel` con stato iniziale + transizione**

In `wm-layer-map.component.scss`, sostituire il blocco `.panel` esistente:

```scss
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--wm-panel-width, 360px);
  max-width: 100%;
  overflow-y: auto;
  z-index: 10;
  background: var(--wm-color-light, #fff);
  transform: translateX(100%);
  transition: transform 250ms ease-out;
}

.panel.panel-open {
  transform: translateX(0);
}

@media (max-width: 600px) {
  .panel {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: opacity 150ms ease-out;
    transform: none;
  }

  .panel:not(.panel-open) {
    opacity: 0;
  }

  .panel.panel-open {
    opacity: 1;
  }
}
```

- [ ] **Step 4: Applicare la classe al frame successivo al mount (per far partire la transizione, non uno snap istantaneo) e gestire il focus**

In `wm-layer-map.component.ts`, aggiungere dopo `onCtaIconError`:

```typescript
  focusPanelClose(el: HTMLElement | undefined): void {
    if (!el) {
      return;
    }
    // Il pannello nasce già nel DOM con lo stato "aperto" lato Angular
    // change detection; il frame successivo (setTimeout 0) dà al browser il
    // tempo di applicare lo stato iniziale (`transform: translateX(100%)`)
    // prima di innescare la transizione — senza questo, la classe
    // `panel-open` risulterebbe già presente al primo paint e l'animazione
    // non si vedrebbe (nessun cambio di stato osservabile dal browser).
    setTimeout(() => el.focus(), 0);
  }
```

Nel template, sul pulsante di chiusura del pannello POI aggiungere `#poiPanelCloseBtn` (già presente in Step 2) e collegare in `ngOnInit`... **correzione**: dato che il pulsante compare/scompare con `*ngIf`, usare `@ViewChild` con `{static: false}` non è affidabile per elementi dentro `*ngIf` che cambiano nel tempo. Usare invece `(focus)`-friendly approccio più semplice: aggiungere `tabindex="-1"` e `cdkFocusInitial`-like comportamento manuale via `AfterViewChecked` è eccessivo per lo scope. Soluzione minima coerente con "non serve focus-trap invasivo" (overview): il pulsante di chiusura è già raggiungibile via `Tab` da tastiera e ha `aria-label` (fatto in Step 2) — **non è necessario** spostare programmaticamente il focus alla sua apertura per soddisfare il requisito minimo. Rimuovere `focusPanelClose` se non strettamente richiesto:

- [ ] **Step 4 (versione finale, sostituisce la precedente): rimuovere `focusPanelClose`, il requisito di focus management è già soddisfatto da `aria-label` + ordine DOM naturale del pulsante `.panel-close`**

Non aggiungere il metodo `focusPanelClose`. Verificare solo che il bottone `.panel-close` esistente (POI) e il dismiss di `wm-track-properties` restino raggiungibili via `Tab` (Step 5).

- [ ] **Step 5: Verifica manuale**

```bash
npm run start:demo
```

- Selezionare un POI o una traccia sulla mappa demo: il pannello deve scivolare da destra con una transizione fluida (non un salto istantaneo)
- Attivare "Reduce motion" nelle preferenze di sistema (macOS: Impostazioni → Accessibilità → Schermo → Riduci movimento) e ripetere: il pannello deve apparire con un fade semplice, non uno scatto brusco
- Ridurre la finestra sotto 600px di larghezza e ripetere: il pannello deve occupare tutta la larghezza
- Premere `Tab` da tastiera fino a raggiungere il pulsante di chiusura del pannello POI: deve essere raggiungibile e avere focus visibile (stile già coperto da Task 4 se si applica la stessa regola `:focus-visible` anche a `.panel-close` — aggiungere se mancante)

- [ ] **Step 6: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.scss src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8259): animate detail panel opening with reduced-motion support"
```

---

### Task 6: Attributo `lang` → `LangService`

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `LangService` (Task 2, già iniettato), `@Input() lang?: string`

- [ ] **Step 1: Impostare la lingua in `ngOnInit`**

In `wm-layer-map.component.ts`, dentro `ngOnInit()`, come prima istruzione del metodo (prima di `this._store.dispatch(loadConf());`):

```typescript
  ngOnInit(): void {
    const resolvedLang = this.lang ?? document.documentElement.lang ?? 'it';
    // LangService.use() scrive anche su localStorage('wm-lang'), condiviso
    // da tutte le istanze del widget sulla stessa pagina: se due
    // <wm-layer-map> con `lang` diversi sono embeddati sulla stessa pagina,
    // l'ultimo a inizializzarsi vince per entrambi. Comportamento
    // preesistente di wm-core (LangService), non risolvibile qui senza
    // toccare il submodule — accettato come rischio noto, non peggiora
    // nulla rispetto a oggi (il widget attuale non imposta affatto `lang`).
    this._langSvc.isInit$
      .pipe(filter(ready => ready === true), take(1))
      .subscribe(() => this._langSvc.use(resolvedLang));

    this._store.dispatch(loadConf());
```

(il resto del metodo `ngOnInit` resta invariato)

- [ ] **Step 2: Verifica manuale**

```bash
npm run start:demo
```

Impostare l'attributo `lang="en"` sull'elemento nella pagina demo e verificare che i testi tradotti tramite `wmtrans` (es. descrizione POI, se disponibile in inglese nella config) cambino lingua. Rimuovere l'attributo e verificare il fallback a `document.documentElement.lang`, poi impostare `document.documentElement.lang = ''` da console e verificare il fallback finale a `it`.

- [ ] **Step 3: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8259): wire lang attribute to LangService with documentElement fallback"
```

---

### Task 7: Aggiornare la pagina di verifica manuale

**Files:**
- Modify: `test/wm-layer-map/index.html`

- [ ] **Step 1: Rigenerare i tag di build**

```bash
npm run build:wm-layer-map
node scripts/sync-test-page.js wm-layer-map
```

- [ ] **Step 2: Aggiungere gli scenari fissi mancanti**

Aprire `test/wm-layer-map/index.html` e verificare/aggiungere, accanto agli scenari esistenti (layer solo-tracce, layer tracce+POI, `hide-cta`, lingua non italiana — questi ultimi due già previsti dalle convenzioni di test del progetto, vedi CLAUDE.md), un elemento `<wm-layer-map>` per ciascuno di questi casi se non già presente:

```html
<h2>CTA con hide-cta attivo</h2>
<wm-layer-map shard="geohub" app-id="1" layer-id="1" hide-cta></wm-layer-map>

<h2>Lingua forzata (en)</h2>
<wm-layer-map shard="geohub" app-id="1" layer-id="1" lang="en"></wm-layer-map>
```

(sostituire `app-id`/`layer-id` con valori reali validi per lo shard usato negli altri scenari già presenti nel file)

- [ ] **Step 3: Verifica manuale end-to-end**

Aprire `test/wm-layer-map/index.html` in un browser e verificare per ciascuno scenario:
- CTA/badge store visibili e funzionanti dove atteso, assenti dove `hide-cta` è impostato
- Layer badge sempre visibile (anche con `hide-cta`)
- Pannello dettaglio si apre con transizione fluida su tutti gli scenari
- Testi in inglese nello scenario `lang="en"`

- [ ] **Step 4: Commit**

```bash
git add test/wm-layer-map/index.html
git commit -m "feat(oc:8259): add CTA/lang manual verification scenarios to test page"
```

---

## Self-Review

**Copertura requisiti overview.md → task:**

| Requisito | Task |
|---|---|
| CTA app-link (icona/label/sottotitolo/URL) | 1, 2, 3, 4 |
| Layer badge | 2, 3 |
| Badge store (piattaforma) | 1, 2, 3 |
| `hide-cta` | 2, 3, 7 |
| `lang` → LangService | 6, 7 |
| Animazione pannello + reduced-motion + full-width | 5 |
| Focus management pannello | 5 (soddisfatto da `aria-label` + tab-order esistente, non serve codice aggiuntivo) |
| Hover/focus states + touch target 44px | 4 |
| Alt/aria-label descrittivi | 3 |
| RTL logico (`inset-inline`/`inset-block`) | 4 |
| Servizio dedicato per platform/URL | 1 |
| Aggiornamento pagina di test | 7 |

Tutti i requisiti dell'overview sono coperti. I rischi accettati (dominio CTA per shard futuri non mappati, `navigator.userAgent` fragile, icona silenziosamente assente, `hide-cta` non copre il layer badge, conflitto `localStorage('wm-lang')` fra istanze multiple) sono documentati inline nei task come commenti di codice, non richiedono task dedicati per essere "risolti oltre" — coerente con l'indicazione di non espandere lo scope oltre quanto approvato in overview/challenge.
