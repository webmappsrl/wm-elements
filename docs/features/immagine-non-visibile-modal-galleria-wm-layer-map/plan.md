# Fix immagine non visibile nel modal della galleria (wm-layer-map) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliccando una foto della galleria nel widget `wm-layer-map`, il modal deve mostrare l'immagine (oggi si apre bianco).

**Architecture:** Il contenuto del modal (`wm-image-detail` di wm-core) è nascosto da un `*ngIf` sul selector `currentEcImageGalleryIndex`, slice che in wm-elements nessuno popola: lo shim `LocalUrlHandlerService` — a differenza del vero `UrlHandlerService` — non dispatcha l'action corrispondente quando cambia il param `gallery_index`. Il fix aggiunge quel dispatch in `_dispatchFromParams`. Nessuna modifica ai submodule.

**Tech Stack:** Angular 20 (Angular Elements), NgRx, submodule `wm-core` (sola lettura).

## Global Constraints

- Branch di lavoro: `feature/oc-8259-replica-ui-vecchio-wm-layer-map` (già esistente e attivo — NON creare branch nuovi).
- Nessun commit/push automatico: i comandi `git` in questo piano sono istruzioni per l'utente, da eseguire solo dopo la sua approvazione esplicita (review-gate wm-plan).
- Nessuna modifica ai submodule (`src/app/shared/*`).
- Node >= 20.19 richiesto: eseguire `nvm use` in ogni nuova shell prima di `npm run start:demo` / `npm run build:*`.
- Nessun test automatico in questo repo (convenzione): la verifica è manuale, via demo e pagina di test del widget.
- Payload del dispatch con check `params.gallery_index != null`, MAI il check truthy usato dalla webapp (`params.gallery_index ? ...`): lì i param URL sono stringhe (`'0'` truthy), qui sono valori raw — col truthy la prima foto (indice `0`) resterebbe rotta.
- Commenti del codice in italiano, coerenti con quelli già presenti nello shim.

---

### Task 1: Dispatch di `currentEcImageGalleryIndex` nello shim

**Files:**
- Modify: `src/app/services/local-url-handler.service.ts` (import righe 5-10, metodo `_dispatchFromParams` righe 125-132)

**Interfaces:**
- Consumes: action `currentEcImageGalleryIndex` da `@wm-core/store/features/ec/ec.actions` (payload `{currentEcImageGalleryIndex: number | null}`)
- Produces: slice `ec.currentEcImageGalleryIndex` popolato a ogni variazione del param `gallery_index` — è ciò che il selector `currentEcImageGalleryIndex` (letto da `wm-image-detail`) si aspetta

- [ ] **Step 1: Aggiungi l'action all'import esistente da `ec.actions`**

L'import in testa al file diventa:

```ts
import {
  currentEcLayerId,
  currentEcTrackId,
  currentEcPoiId,
  currentEcRelatedPoiId,
  currentEcImageGalleryIndex,
} from '@wm-core/store/features/ec/ec.actions';
```

- [ ] **Step 2: Aggiungi il dispatch in `_dispatchFromParams` con commento sulle omissioni deliberate**

Il metodo `_dispatchFromParams` diventa:

```ts
  private _dispatchFromParams(params: Params): void {
    this._store.dispatch(currentEcLayerId({currentEcLayerId: params.layer ?? null}));
    this._store.dispatch(currentEcTrackId({currentEcTrackId: params.track ?? null}));
    this._store.dispatch(currentEcPoiId({currentEcPoiId: params.poi ?? null}));
    this._store.dispatch(
      currentEcRelatedPoiId({currentRelatedPoiId: params.ec_related_poi ?? null}),
    );
    // `wm-image-detail` (contenuto del modal galleria) è avvolto da un *ngIf
    // su questo slice: senza dispatch resterebbe `undefined` → `undefined + 1
    // = NaN` → modal bianco. Check `!= null` e non truthy come nella webapp:
    // lì i param URL sono stringhe ('0' è truthy), qui sono valori raw e la
    // prima foto ha indice 0.
    this._store.dispatch(
      currentEcImageGalleryIndex({
        currentEcImageGalleryIndex: params.gallery_index != null ? +params.gallery_index : null,
      }),
    );
    // Omissioni deliberate rispetto al vero UrlHandlerService.initialize():
    // currentUgcTrackId, currentUgcPoiId e inputTyped non vengono dispatchati
    // perché UGC e ricerca sono feature fuori scope del widget.
  }
```

- [ ] **Step 3: Verifica che la compilazione demo parta senza errori**

Run:
```bash
nvm use && npm run start:demo
```
Expected: compilazione senza errori TypeScript, demo raggiungibile (URL indicato da `ng serve`, tipicamente `http://localhost:4200`).

---

### Task 2: Verifica manuale in demo

**Files:** nessuno (solo verifica).

**Interfaces:**
- Consumes: la demo avviata al Task 1 Step 3 (`npm run start:demo`).

- [ ] **Step 1: Scenario base + prima foto (indice 0)**

Nella demo (shard/app della segnalazione: `shard=camminiditalia`, `app-id=1`, `layer-id=130`): apri una traccia con galleria, clicca la **prima** foto.
Expected: il modal mostra la prima foto (non bianco); se le foto sono più di una compare il contatore "1 di M".

- [ ] **Step 2: Frecce, contatore e foto non-prima**

Clicca una foto diversa dalla prima; usa le frecce prev/next.
Expected: il modal si apre sulla foto cliccata; le frecce scorrono e il contatore si aggiorna; la freccia prev è nascosta sulla prima foto, next sull'ultima.

- [ ] **Step 3: Chiusura e riapertura (incluso backdrop/ESC)**

Chiudi col bottone X, riapri. Poi chiudi cliccando il backdrop (o ESC), riapri. Dopo la chiusura da backdrop, clicca una volta il bottone "indietro"/chiudi del pannello di dettaglio.
Expected: la riapertura funziona sempre e mostra la foto cliccata; il primo "indietro" dopo la chiusura da backdrop chiude davvero il pannello (non viene "mangiato" da un `gallery_index` orfano in `removeLatest`). Se il primo indietro va a vuoto, annotarlo in notes.md come difetto residuo con causa nota (backdrop/ESC bypassano `closeModal()`).

- [ ] **Step 4: Contesti related POI e POI generico**

Apri un related POI di una traccia e clicca una foto della sua galleria; poi ripeti con un POI generico (non legato alla traccia).
Expected: in entrambi i contesti il modal mostra le foto del soggetto corrente.

---

### Task 3: Verifica manuale sulla build custom element (Shadow DOM)

**Files:** nessuno da committare (la build rigenera `dist/wm-layer-map/` locale e `scripts/sync-test-page.js` aggiorna `test/wm-layer-map/index.html`).

**Interfaces:**
- Consumes: il fix del Task 1.

- [ ] **Step 1: Build elements e sync della pagina di test**

Run:
```bash
nvm use && npm run build:wm-layer-map && node scripts/sync-test-page.js wm-layer-map
```
Expected: build completata senza errori; `test/wm-layer-map/index.html` aggiornato con gli hash dei nuovi bundle.

- [ ] **Step 2: Ripeti gli scenari del Task 2 sulla pagina di test**

Apri `test/wm-layer-map/index.html` servito in locale (es. `npx http-server test/wm-layer-map` o equivalente) e ripeti gli step 1-4 del Task 2.
Expected: comportamento identico alla demo.

- [ ] **Step 3: Check esplicito stili del modal fuori Shadow DOM**

Il root del widget usa `ViewEncapsulation.ShadowDom`, ma Ionic monta `ion-modal` fuori dallo shadow root: gli stili di `wm-image-detail`/`wm-modal-image` (encapsulation `None`) potrebbero non raggiungerlo in questa build. Ispeziona il modal aperto: immagine visibile e dimensionata, footer con frecce/contatore impaginato, bottone di chiusura in alto.
Expected: resa visivamente equivalente alla webapp. **Se gli stili non arrivano al modal: fermarsi e segnalarlo all'utente prima di considerare chiuso il fix** — è un secondo difetto (Shadow DOM) che va risolto in questo ciclo, non rimandato.

---

### Task 4: Documentazione e commit (dopo approvazione utente)

**Files:**
- Create: `docs/features/immagine-non-visibile-modal-galleria-wm-layer-map/notes.md`

- [ ] **Step 1: Compila notes.md**

Registra: esito delle verifiche (demo ed elements), eventuale difetto residuo su backdrop/ESC (`gallery_index` orfano) o su stili Shadow DOM, e le segnalazioni del challenge non affrontate in questo ciclo (pattern shim-copia-manuale senza meccanismo di parità; `on(currentEcImageGalleryIndex, ...)` duplicato nel reducer di wm-core, righe 108 e 115 — da segnalare al team wm-core).

- [ ] **Step 2: Commit (istruzione per l'utente — solo dopo review-gate)**

```bash
git add src/app/services/local-url-handler.service.ts docs/features/immagine-non-visibile-modal-galleria-wm-layer-map/ test/wm-layer-map/index.html
git commit -m "fix(oc:8259): dispatch gallery index from url shim so the gallery modal renders"
```
