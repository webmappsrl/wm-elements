# wm-layer-map: bbox iniziale senza zoom animato + vincolo pan/zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il widget `wm-layer-map` deve avviarsi già centrato/fittato sul bbox del layer (senza animazione di zoom visibile) e impedire all'utente di dezoomare oltre quel livello o di spostare il centro della mappa fuori dal bbox iniziale.

**Architecture:** Una nuova direttiva Angular standalone (`WmLayerMapDirective`, selettore `[wmLayerMap]`), applicata sullo stesso host `<wm-map>` accanto alle direttive esistenti di `map-core` (`wmMapLayer`, `wmMapPois`, ecc.), espone un metodo pubblico `apply(bbox, maxZoom, padding)` che sostituisce la `View` OpenLayers corrente con una vincolata al bbox del layer (extent + minZoom calcolato dal fit), chiamato in modo imperativo da `WmLayerMapComponent.ngOnInit()` **prima** che il dispatch dello store inneschi il fit animato esistente di `wmMapLayer` — nessuna modifica ai submodule `map-core`/`wm-core`.

**Tech Stack:** Angular 20 (standalone directive), OpenLayers (`ol/View`, `Map.setView`), NgRx (store selectors già esistenti), TypeScript.

## Global Constraints

- Nessuna modifica ai file sotto `src/app/shared/map-core`, `src/app/shared/wm-core`, `src/app/shared/wm-types` (submodule, mai modificati — vedi CLAUDE.md).
- Nessuna suite di test automatica in questo repo: la verifica è manuale, tramite `npm run start:demo` e/o `test/wm-layer-map/index.html` (vedi CLAUDE.md, sezione "Convenzioni di test").
- Alias TS esistenti da riusare: `@map-core/*` → `src/app/shared/map-core/src/*`.
- Se il layer non ha `bbox`, il comportamento deve restare quello attuale (nessuna regressione).

---

## Mappa dei file

- **Create:** `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` — nuova direttiva `WmLayerMapDirective`, unica responsabilità: sostituire la `View` OL con una vincolata al bbox passato.
- **Modify:** `src/app/wm-layer-map/wm-layer-map.component.ts` — aggiungere `@ViewChild(WmLayerMapDirective)`, cambiare la ricerca del layer da `.some(...)` a `.find(...)`, chiamare `apply(...)` prima di `updateURL(...)`.
- **Modify:** `src/app/wm-layer-map/wm-layer-map.component.html` — aggiungere l'attributo `wmLayerMap` sul tag `<wm-map #wmap ...>` esistente.

---

### Task 1: Creare la direttiva `WmLayerMapDirective`

**Files:**
- Create: `src/app/wm-layer-map/directives/wm-layer-map.directive.ts`

**Interfaces:**
- Produces: `class WmLayerMapDirective` con selettore `[wmLayerMap]` e metodo pubblico `apply(bbox: [number, number, number, number], maxZoom: number, padding: number[]): void`. Consumato da `WmLayerMapComponent` (Task 2) via `@ViewChild(WmLayerMapDirective)`.

Questa direttiva replica il pattern già in uso nel submodule `map-core` (es. `src/app/shared/map-core/src/directives/layer.directive.ts`, che inietta `@Host() public mapCmp: WmMapComponent` e opera su `mapCmp.map` — API pubblica di OpenLayers, campo `map: OlMap` non privato in `WmMapComponent`). Non è nel submodule: vive in `wm-elements`, applicata sullo stesso host `<wm-map>`.

- [ ] **Step 1: Scrivere il file della direttiva**

```ts
import {Directive, Host} from '@angular/core';
import View from 'ol/View';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {extentFromLonLat} from '@map-core/utils';

/**
 * Sostituisce la View OL corrente con una vincolata al bbox del layer:
 * centraggio istantaneo (nessuna animazione) e blocco del dezoom oltre
 * il livello del fit iniziale. Il pan resta vincolato al bbox tramite
 * `extent` + `constrainOnlyCenter`. Il maxZoom resta invariato (zoom-in
 * libero).
 */
@Directive({
  selector: '[wmLayerMap]',
  standalone: true,
})
export class WmLayerMapDirective {
  constructor(@Host() private _mapCmp: WmMapComponent) {}

  apply(bbox: [number, number, number, number], maxZoom: number, padding: number[]): void {
    if (this._mapCmp.map == null || bbox == null) {
      return;
    }

    const extent = extentFromLonLat(bbox);

    const view = new View({
      projection: 'EPSG:3857',
      extent,
      constrainOnlyCenter: true,
      showFullExtent: true,
      maxZoom,
    });

    this._mapCmp.map.setView(view);

    view.fit(extent, {duration: 0, padding, nearest: true});
    view.setMinZoom(view.getZoom());
  }
}
```

- [ ] **Step 2: Verificare che il typecheck passi**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun errore relativo a `wm-layer-map.directive.ts` (il file non è ancora usato altrove, quindi non deve emettere errori "unused" bloccanti — verificare che il progetto non abbia `noUnusedLocals`/`noUnusedParameters` che falliscano su un file non ancora referenziato; se sì, è atteso finché non si completa il Task 2/3, quindi ignorare eventuali soli warning "file is part of compilation but unused", coerenti con quelli già presenti per altri entry point come `src/main.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/app/wm-layer-map/directives/wm-layer-map.directive.ts
git commit -m "$(cat <<'EOF'
feat(oc:8259): add wmLayerMap directive to lock map view to layer bbox

Replaces the OL View with one whose extent is the layer's bbox
(constrainOnlyCenter + fit with duration:0 + minZoom locked to the
fit level), so the widget can start already centered without an
animated zoom-out-then-in, and without editing map-core.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Applicare la direttiva sul template e recuperarla via `@ViewChild`

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html`
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `WmLayerMapDirective` e il suo metodo `apply(bbox, maxZoom, padding)` (Task 1).
- Produces: `WmLayerMapComponent._wmLayerMapDirective: WmLayerMapDirective` (campo privato, popolato da Angular via `@ViewChild`), usato dal Task 3.

- [ ] **Step 1: Aggiungere l'attributo `wmLayerMap` al tag `<wm-map>`**

In `src/app/wm-layer-map/wm-layer-map.component.html`, riga 111-112, il tag apre così:

```html
  <wm-map
    #wmap
    [wmMapConf]="confMap$|async"
```

Modificarlo aggiungendo l'attributo `wmLayerMap` (nessun binding, solo l'attributo selettore):

```html
  <wm-map
    #wmap
    wmLayerMap
    [wmMapConf]="confMap$|async"
```

- [ ] **Step 2: Importare `WmLayerMapDirective` nel componente**

In `src/app/wm-layer-map/wm-layer-map.component.ts`, aggiungere l'import (vicino agli altri import locali, es. dopo la riga `import {WidgetBrandingService, WidgetPlatform} from '../services/widget-branding.service';`):

```ts
import {WmLayerMapDirective} from './directives/wm-layer-map.directive';
```

- [ ] **Step 3: Aggiungere la direttiva agli `imports` dello standalone component**

Il decoratore del componente (righe 85-93) ha:

```ts
@Component({
  selector: 'app-wm-layer-map-root',
  standalone: true,
  imports: [CommonModule, WmCoreModule, IonicModule],
  templateUrl: './wm-layer-map.component.html',
  styleUrl: './wm-layer-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
```

Modificare `imports` per includere la nuova direttiva:

```ts
  imports: [CommonModule, WmCoreModule, IonicModule, WmLayerMapDirective],
```

- [ ] **Step 4: Aggiungere il `@ViewChild`**

Subito dopo il blocco esistente (righe 110-111):

```ts
  @ViewChild(WmMapTrackRelatedPoisDirective)
  WmMapTrackRelatedPoisDirective: WmMapTrackRelatedPoisDirective;
```

aggiungere:

```ts
  @ViewChild(WmLayerMapDirective) private _wmLayerMapDirective: WmLayerMapDirective;
```

- [ ] **Step 5: Verificare che il typecheck passi**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "$(cat <<'EOF'
feat(oc:8259): wire wmLayerMap directive into wm-layer-map component

Not yet invoked — next task calls _wmLayerMapDirective.apply(...)
from ngOnInit before the layer fit is triggered.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Chiamare `apply(...)` prima del fit animato esistente

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts`

**Interfaces:**
- Consumes: `this._wmLayerMapDirective.apply(bbox, maxZoom, padding)` (Task 2); `ILAYER.bbox: [number, number, number, number]` (già definito in `@map-core/types/layer`, tipo già importato in questo file come `IDATALAYER`/`ILAYER`? — verificare: il file importa `IDATALAYER` da `@map-core/types/layer` ma non `ILAYER`; va aggiunto all'import esistente); `IMAP.maxZoom: number` (letto da `confMap$`, proprietà di classe già esistente); selettore `padding` da `@map-core/store/map-core.selector` (già importato e usato come `mapPadding$` in questo file).
- Produces: comportamento finale del widget (nessuna interfaccia consumata da altri task).

Il blocco da modificare è in `ngOnInit()`, righe 334-350:

```ts
    this._store
      .select(isConfLoaded)
      .pipe(filter(loaded => loaded === true), take(1))
      .subscribe(() => {
        this._store.select(confMAPLAYERS).pipe(
          filter(layers => layers != null),
          take(1),
        ).subscribe(layers => {
          const layerExists = layers.some(l => +l.id === +this.layerId);
          if (!layerExists) {
            this.error.emit({message: `layer ${this.layerId} not found`});
            return;
          }
          this._urlHandlerSvc.updateURL({layer: this.layerId});
          this.ready.emit();
        });
      });
```

- [ ] **Step 1: Aggiungere `ILAYER` all'import esistente da `@map-core/types/layer`**

Trovare la riga:

```ts
import {IDATALAYER} from '@map-core/types/layer';
```

e sostituirla con:

```ts
import {IDATALAYER, ILAYER} from '@map-core/types/layer';
```

- [ ] **Step 2: Sostituire il blocco `ngOnInit` per trovare l'oggetto layer completo e applicare il vincolo prima di `updateURL`**

Sostituire l'intero blocco di Step precedente (righe 334-350) con:

```ts
    this._store
      .select(isConfLoaded)
      .pipe(filter(loaded => loaded === true), take(1))
      .subscribe(() => {
        this._store.select(confMAPLAYERS).pipe(
          filter(layers => layers != null),
          take(1),
        ).subscribe((layers: ILAYER[]) => {
          const layer = layers.find(l => +l.id === +this.layerId);
          if (layer == null) {
            this.error.emit({message: `layer ${this.layerId} not found`});
            return;
          }
          if (layer.bbox != null) {
            combineLatest([this.confMap$, this.mapPadding$])
              .pipe(take(1))
              .subscribe(([conf, currentPadding]) => {
                this._wmLayerMapDirective.apply(
                  layer.bbox,
                  conf.maxZoom,
                  currentPadding ?? initPadding,
                );
              });
          }
          this._urlHandlerSvc.updateURL({layer: this.layerId});
          this.ready.emit();
        });
      });
```

`combineLatest` è già importato in questo file (riga 48: `import {BehaviorSubject, combineLatest, forkJoin, Observable, of} from 'rxjs';`), così come `initPadding` (costante di modulo, riga 73: `const initPadding = [10, 10, 10, 10];`) e `mapPadding$` (proprietà di classe, riga 195 circa: `mapPadding$ = this._store.select(padding);`) — nessun nuovo import necessario per questo step.

La chiamata a `apply(...)` avviene sincronamente dentro la subscribe di `combineLatest` (che risolve immediatamente con `take(1)` perché sia `confMap$` che `mapPadding$` hanno già un valore essendo lo store già stato caricato a questo punto), e **prima** di `this._urlHandlerSvc.updateURL({layer: this.layerId})` — che è la chiamata che, in modo asincrono, fa arrivare il layer a `wmMapLayer` (tramite `ecLayer`/`currentLayer$`) e innesca il suo fit animato esistente.

- [ ] **Step 3: Verificare che il typecheck passi**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "$(cat <<'EOF'
feat(oc:8259): snap map to layer bbox before the animated fit runs

wm-layer-map now finds the full layer object (not just its existence)
when resolving confMAPLAYERS, and — if it has a bbox — calls the new
wmLayerMap directive's apply() before dispatching updateURL. This
locks the view to the layer's bbox (instant fit, no dezoom past the
fit level, pan constrained to the bbox) before map-core's own
animated layer fit fires, so that fit becomes a visual no-op.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verifica manuale end-to-end

**Files:** nessuna modifica (solo verifica).

Questo repo non ha una suite di test automatica (vedi CLAUDE.md, "Convenzioni di test") — la verifica è manuale tramite la demo.

- [ ] **Step 1: Avviare la demo**

Se Node di sistema è `<20.19`, usare `nvm` (vedi CLAUDE.md, "Sviluppo quotidiano"):

```bash
nvm use
npm run start:demo
```

Aprire `http://localhost:4200/` nel browser (con header `Accept: text/html` implicito — qualsiasi browser reale lo invia di default, nessuna azione necessaria).

- [ ] **Step 2: Verificare l'assenza di animazione di zoom all'avvio**

Con i valori di default del form (`shard=camminiditalia`, `app-id=1`, `layer-id=120`), cliccare "Applica e ricarica anteprima" e osservare: la mappa deve apparire già centrata/fittata sul layer, **senza** un visibile zoom-out-poi-zoom-in.

Expected: nessuna animazione di zoom visibile al caricamento del layer.

- [ ] **Step 3: Verificare il blocco del dezoom**

Con lo scroll/pinch, provare a dezoomare oltre il livello iniziale.

Expected: lo zoom si ferma al livello del fit iniziale, non si può andare oltre.

- [ ] **Step 4: Verificare il vincolo di pan**

Trascinare la mappa nel tentativo di allontanarsi dal bbox del layer.

Expected: il centro della mappa resta vincolato entro il bbox iniziale del layer (non si riesce a "uscire" trascinando).

- [ ] **Step 5: Verificare che lo zoom-in libero e lo zoom-to-track/poi continuino a funzionare**

Zoomare in avanti (in) liberamente: deve funzionare senza limiti aggiuntivi rispetto al `maxZoom` già esistente. Cliccare su una traccia o un POI del layer (se lo scenario di test lo prevede — vedi `test/wm-layer-map/index.html`, scenario "layer tracce+POI"): il comportamento di zoom/centraggio sulla feature selezionata deve restare quello attuale (nei limiti del bbox/minZoom impostati).

Expected: nessuna regressione sulle interazioni esistenti.

- [ ] **Step 6: Verificare il caso di layer senza bbox (se disponibile uno scenario)**

Se esiste un `layer-id` di test senza `bbox` valorizzato, verificare che il comportamento sia quello preesistente (fit animato di `wmMapLayer`, se presente, senza vincoli aggiuntivi) — nessun errore in console.

Expected: nessuna regressione per layer senza bbox.

- [ ] **Step 7: Rebuild della build "elements" e verifica della pagina di test manuale**

Poiché si è toccato solo `wm-layer-map` (nessun cambiamento a mapping attributi/eventi del custom element), la verifica della build "elements" è opzionale per questa modifica specifica (vedi CLAUDE.md, "Sviluppo quotidiano": va verificata "solo prima di pubblicare o quando si tocca qualcosa di specifico del custom element"). Se si vuole comunque verificare:

```bash
npm run build:wm-layer-map
node scripts/sync-test-page.js wm-layer-map
```

Aprire `test/wm-layer-map/index.html` in un browser e ripetere gli Step 2-5 sui tre scenari fissi (layer solo-tracce, layer tracce+POI, `hide-cta` attivo).

---

## Riepilogo modifiche ai file

| File | Tipo | Cosa cambia |
|---|---|---|
| `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` | Create | Nuova direttiva `[wmLayerMap]` |
| `src/app/wm-layer-map/wm-layer-map.component.html` | Modify | Attributo `wmLayerMap` su `<wm-map>` |
| `src/app/wm-layer-map/wm-layer-map.component.ts` | Modify | Import + `imports` array + `@ViewChild` + logica in `ngOnInit` |
