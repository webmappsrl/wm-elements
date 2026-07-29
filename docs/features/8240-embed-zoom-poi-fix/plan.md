> Ticket: oc:8240

# EMBED zoom minimo e POI mancanti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Risolvere i due bug segnalati dal cliente Cammini d'Italia sull'embed pubblicato del widget `<wm-layer-map>`: zoom minimo troppo restrittivo e POI mancanti su alcuni layer.

**Architecture:** Due fix indipendenti, entrambi confinati al repo `wm-elements`, nessuna modifica ai submodule (`wm-core`/`map-core`):
1. `WmLayerMapDirective.apply()` riceve un quarto parametro `confMinZoom` e imposta `view.setMinZoom(Math.max(fitZoom - 1, confMinZoom))` invece del lock rigido attuale.
2. `confMap$` in `wm-layer-map.component.ts` viene trasformato con un operatore RxJS `map()` per forzare `pois.poiMinZoom = 5` prima di essere bindato a `[wmMapConf]` in `wm-layer-map.component.html` — lo stesso binding alimenta sia `<wm-map>` sia la direttiva `wmMapPois` di map-core, quindi è sufficiente intervenire qui, senza override DI di `ConfService` (approccio iniziale scartato: `npm run start:demo` usa un bootstrap Angular separato che non eredita override registrati in `bootstrap-widget.ts`, causando comportamento incoerente tra demo e widget reale — vedi `notes.md`).

**Tech Stack:** Angular 20, RxJS, OpenLayers (`ol/View`), NgRx (store di wm-core).

## Global Constraints

- Nessuna modifica ai submodule `wm-core`/`map-core`: si estendono classi via `extends` + override DI, si importa da `src/*` via alias (`@wm-core/*`), mai si edita un file dentro `src/app/shared/`.
- Nessuna suite di test automatica in questo repo: la verifica è manuale, tramite `npm run start:demo` e ispezione visiva sul layer 40 (shard `camminiditalia`, "Cammino Grande di Celestino") e su un secondo layer/shard per confermare che il fix è globale.
- **Bug noto da NON reintrodurre**: in `map-core/src/directives/pois.directive.ts` la soglia POI è letta come `+this.wmMapConf?.pois?.poiMinZoom || 15` — `0` è falsy in JS, quindi un override a `0` ricadrebbe silenziosamente sul fallback `15`. Usare sempre un valore non-falsy (`5`), mai `0`.
- Commit convention: `feat(oc:8240): ...` per ogni commit di questo piano. I commit sono istruzioni testuali per lo sviluppatore/skill di esecuzione — non vanno eseguiti automaticamente senza il gate di review previsto dal workflow `wm-plan`.

---

### Task 1: Fix zoom minimo in `WmLayerMapDirective`

**Files:**
- Modify: `src/app/wm-layer-map/directives/wm-layer-map.directive.ts:26-72`
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts:369-377` (chiamata ad `apply()`)

**Interfaces:**
- Consumes: `ICONF.MAP.minZoom` (già esistente in `src/app/shared/wm-core/projects/wm-core/src/types/config.ts:260`, campo `minZoom: number` non opzionale su `IMAP`), letto dal componente come `conf.minZoom` nello stesso blocco dove oggi si legge `conf.maxZoom` (riga 374).
- Produces: `WmLayerMapDirective.apply(bbox, maxZoom, padding, confMinZoom)` — firma con un quarto parametro obbligatorio `confMinZoom: number`.

- [ ] **Step 1: Modificare la firma di `apply()` e `_applyWhenMapReady()` in `wm-layer-map.directive.ts`**

Sostituire il contenuto del file con:

```typescript
import {Directive, Host} from '@angular/core';
import View from 'ol/View';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {extentFromLonLat} from '@map-core/utils';

const MAP_READY_POLL_INTERVAL_MS = 50;
const MAP_READY_POLL_MAX_ATTEMPTS = 40; // ~2s

/**
 * Sostituisce la View OL corrente con una vincolata al bbox del layer:
 * centraggio istantaneo (nessuna animazione) e un dezoom limitato a un
 * livello sotto il fit iniziale (mai sotto il minZoom globale di config).
 * Il pan resta vincolato al bbox tramite `extent` con
 * `constrainOnlyCenter: false` (vincola l'intero viewport visibile, non
 * solo il punto centrale — con `constrainOnlyCenter: true` il centro
 * resta dentro il bbox ma i bordi della vista possono comunque mostrare
 * area oltre il bbox per metà della larghezza/altezza del viewport). Il
 * maxZoom resta invariato (zoom-in libero).
 */
@Directive({
  selector: '[wmLayerMap]',
  standalone: true,
})
export class WmLayerMapDirective {
  constructor(@Host() private _mapCmp: WmMapComponent) {}

  apply(
    bbox: [number, number, number, number],
    maxZoom: number,
    padding: number[],
    confMinZoom: number,
  ): void {
    if (bbox == null) {
      return;
    }
    this._applyWhenMapReady(bbox, maxZoom, padding, confMinZoom, 0);
  }

  // `WmMapComponent.map` (l'istanza OL) viene creata da map-core solo dopo
  // un delay interno successivo al caricamento della config (vedi
  // map.component.ts, ngAfterViewInit: `wmMapConf$.pipe(..., delay(250))`),
  // quindi al momento in cui questo metodo viene chiamato (subito dopo che
  // anche la nostra config/layer sono disponibili) `map` può non esistere
  // ancora. Si effettua un retry limitato invece di dipendere da quel
  // timing interno del submodule.
  private _applyWhenMapReady(
    bbox: [number, number, number, number],
    maxZoom: number,
    padding: number[],
    confMinZoom: number,
    attempt: number,
  ): void {
    if (this._mapCmp.map == null) {
      if (attempt >= MAP_READY_POLL_MAX_ATTEMPTS) {
        return;
      }
      setTimeout(
        () => this._applyWhenMapReady(bbox, maxZoom, padding, confMinZoom, attempt + 1),
        MAP_READY_POLL_INTERVAL_MS,
      );
      return;
    }

    const extent = extentFromLonLat(bbox);

    const view = new View({
      projection: 'EPSG:3857',
      extent,
      constrainOnlyCenter: false,
      showFullExtent: true,
      maxZoom,
    });

    this._mapCmp.map.setView(view);
    (this._mapCmp as any)._view = view;

    view.fit(extent, {duration: 0, padding, nearest: true});
    const fitZoom = view.getZoom();
    view.setMinZoom(Math.max(fitZoom - 1, confMinZoom));
  }
}
```

- [ ] **Step 2: Aggiornare la chiamata ad `apply()` in `wm-layer-map.component.ts`**

Nel blocco a `wm-layer-map.component.ts:369-377`, sostituire:

```typescript
            combineLatest([this.confMap$, this.mapPadding$, this._afterViewInit$])
              .pipe(take(1))
              .subscribe(([conf, currentPadding]) => {
                this._wmLayerMapDirective.apply(
                  layer.bbox,
                  conf.maxZoom,
                  currentPadding ?? initPadding,
                );
              });
```

con:

```typescript
            combineLatest([this.confMap$, this.mapPadding$, this._afterViewInit$])
              .pipe(take(1))
              .subscribe(([conf, currentPadding]) => {
                this._wmLayerMapDirective.apply(
                  layer.bbox,
                  conf.maxZoom,
                  currentPadding ?? initPadding,
                  conf.minZoom,
                );
              });
```

`conf` in questo blocco è già il valore emesso da `confMap$` (selettore `confMAP`, tipo `IMAP`), che ha già il campo `minZoom: number` — nessuna modifica al tipo o a nuovi selettori necessaria.

- [ ] **Step 3: Verifica manuale — dezoom limitato**

Comando:

```bash
nvm use
npm run start:demo
```

Nella pagina demo, impostare `shard=camminiditalia`, `app-id=1`, `layer-id=40`. Dopo il caricamento della mappa (fit automatico sul bbox del cammino), provare a dezoomare con lo scroll/pinch:
- **Atteso:** il dezoom è possibile per un livello oltre il fit iniziale, poi si blocca (comportamento precedente: zero dezoom possibile).
- Verificare inoltre che il dezoom non scenda mai sotto zoom 6 (il `MAP.minZoom` letto in precedenza dal config.json reale dello shard).

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/directives/wm-layer-map.directive.ts src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8240): allow one zoom level of dezoom below layer fit, clamped to config minZoom"
```

---

### Task 2: Forzare `poiMinZoom` nel binding `confMap$` di `wm-layer-map.component.ts`

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts` (costante top-level + definizione `confMap$`)

**Interfaces:**
- Consumes: selettore NgRx `confMAP` (già usato, tipo `IMAP` con `pois?: any`), operatore `map` da `rxjs/operators` (già importato nel file).
- Produces: `confMap$: Observable<any>` con lo stesso identico contratto di prima (consumato da `[wmMapConf]="confMap$|async"` in `wm-layer-map.component.html:118` e dal blocco `combineLatest([this.confMap$, ...])` di Task 1) — solo il campo `pois.poiMinZoom` cambia valore, nessuna altra proprietà o firma cambia.

- [ ] **Step 1: Aggiungere la costante `WIDGET_POI_MIN_ZOOM`**

Vicino alle altre costanti top-level del file (`initPadding`, `maxWidth`), aggiungere:

```typescript
const WIDGET_POI_MIN_ZOOM = 5;
```

- [ ] **Step 2: Trasformare `confMap$`**

Sostituire:

```typescript
  confMap$: Observable<any> = this._store.select(confMAP);
```

con:

```typescript
  // `poiMinZoom` in map-core (pois.directive.ts) nasconde il layer POI
  // sotto una soglia di zoom (letta come `+wmMapConf?.pois?.poiMinZoom ||
  // 15` — 0 è falsy in JS, quindi il valore forzato qui non può essere 0
  // o ricadrebbe silenziosamente sul fallback 15). Si forza `5`, soglia
  // sempre soddisfatta nei casi reali del widget (fit di un singolo
  // cammino produce zoom ben più alto), per tenere i POI sempre visibili
  // senza modificare map-core. Stesso oggetto alimenta sia <wm-map> che
  // la direttiva wmMapPois via il binding [wmMapConf] in
  // wm-layer-map.component.html.
  confMap$: Observable<any> = this._store.select(confMAP).pipe(
    map(conf =>
      conf == null
        ? conf
        : {...conf, pois: {...(conf.pois ?? {}), poiMinZoom: WIDGET_POI_MIN_ZOOM}},
    ),
  );
```

- [ ] **Step 3: Verifica manuale — POI sempre visibili, sia in demo che nel widget**

Con `npm run start:demo` attivo, verificare su **due casi**:

1. `shard=camminiditaliadev` (o `camminiditalia`), `app-id=1`, `layer-id=40` ("Cammino Grande di Celestino"): i marker POI compaiono subito al caricamento, senza dover zoomare oltre lo zoom 11 (soglia precedente).
2. Un secondo shard/layer già noto per avere POI visibili con il comportamento precedente (es. uno dei layer già verificati in `docs/features/8252-wm-layer-map-angular/`): confermare che i POI restano visibili come prima — il fix non deve nascondere POI che già comparivano.

A differenza dell'approccio scartato (override DI su `ConfService`), questo fix è verificabile direttamente in demo, perché non dipende da quale bootstrap monta il componente.

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(oc:8240): force poiMinZoom in confMap\$ to keep layer POIs always visible"
```

---

---

### Task 3: Margine sul bbox per i punti estremi (10% per lato)

> Requisito emerso dopo la verifica visiva dei Task 1/2, non presente nel commento originale del cliente — stesso ambito "usabilità embed".

**Files:**
- Modify: `src/app/wm-layer-map/directives/wm-layer-map.directive.ts`

**Interfaces:**
- Consumes: nessuna nuova dipendenza esterna.
- Produces: `bufferExtent(extent: [number, number, number, number]): [number, number, number, number]`, funzione pura top-level nel file, usata internamente da `_applyWhenMapReady` prima di costruire la `View` e chiamare `fit()`.

- [ ] **Step 1: Aggiungere costante e funzione `bufferExtent`**

Vicino a `MAP_READY_POLL_INTERVAL_MS`/`MAP_READY_POLL_MAX_ATTEMPTS`:

```typescript
const BBOX_MARGIN_RATIO = 0.1;

// Allarga l'extent (EPSG:3857) del 10% per lato: senza margine i punti di
// partenza/arrivo del cammino restano appiccicati al bordo del viewport
// (sia nel fit iniziale sia nel vincolo di pan), difficili da cliccare.
function bufferExtent(extent: [number, number, number, number]): [number, number, number, number] {
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];
  const bufferX = width * BBOX_MARGIN_RATIO;
  const bufferY = height * BBOX_MARGIN_RATIO;
  return [extent[0] - bufferX, extent[1] - bufferY, extent[2] + bufferX, extent[3] + bufferY];
}
```

- [ ] **Step 2: Applicare il buffer all'extent usato da `View` e `fit()`**

In `_applyWhenMapReady`, sostituire:

```typescript
    const extent = extentFromLonLat(bbox);
```

con:

```typescript
    const extent = bufferExtent(extentFromLonLat(bbox));
```

Il resto del metodo (costruzione `View`, `view.fit(extent, ...)`, `setMinZoom`) resta invariato — riceve già `extent` allargato, sia per il vincolo di pan sia per il fit iniziale.

- [ ] **Step 3: Verifica manuale — margine cliccabile agli estremi**

Con `npm run start:demo` attivo, su `shard=camminiditaliadev`, `app-id=1`, `layer-id=40`:
- **Atteso:** i marker di partenza/arrivo del cammino non sono più appiccicati al bordo della mappa al caricamento iniziale; c'è margine visibile per cliccarli.
- Verificare che il pan non permetta comunque di allontanarsi eccessivamente dal cammino (il vincolo resta attivo, solo più largo del 10%).

- [ ] **Step 4: Commit**

```bash
git add src/app/wm-layer-map/directives/wm-layer-map.directive.ts
git commit -m "feat(oc:8240): buffer layer bbox by 10% per side for clickable endpoint margin"
```

## Self-Review

**Copertura requisiti (da overview.md):**
- `minZoom = fit - 1` clampato a `MAP.minZoom` → Task 1.
- `poiMinZoom` forzato a `5` (non `0`, per via del bug falsy) tramite `WidgetConfService` → Task 2.
- Nessuna modifica al submodule `map-core`/`wm-core` → rispettato in entrambi i task (solo `extends`/override DI, import via alias).
- Verifica manuale su layer 40 e su un secondo layer/shard per confermare comportamento globale → Step 3 di entrambi i task.

**Placeholder scan:** nessun "TBD"/"handle edge cases" generico — ogni step ha codice completo e comandi eseguibili.

**Type consistency:** `apply()` ha 4 parametri in tutte le occorrenze (dichiarazione e chiamata); `WidgetConfService.getConf()` mantiene la stessa firma di ritorno (`Observable<ICONF>`) della classe base, nessun consumer di `ConfService` altrove nel codebase necessita modifiche essendo un override trasparente via DI.
