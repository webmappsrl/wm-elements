> Ticket: oc:8937

# Attributo `track-id` per `wm-layer-map` — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<wm-layer-map track-id="…">` apre all'avvio la traccia indicata, come un click, una sola volta.

**Architecture:** nuovo `@Input('track-id')` su `WmLayerMapComponent`. Subito dopo `_wmLayerMapDirective.apply(...)`
il componente attende sulla mappa OpenLayers il primo `rendercomplete` e poi il `moveend` successivo (limite 1,5 s),
poi chiama `updateEcTrack(id)`, la stessa funzione del click. La mappa si legge da un getter pubblico nuovo su
`WmLayerMapDirective`.

**Tech Stack:** Angular 20 (Elements), NgRx, OpenLayers via `map-core`. Node 20.20.2 (`nvm use`).

**Spec:** `docs/features/8937-embed-mappe-per-singola-traccia/overview.md`

## Global Constraints

- Solo repo `wm-elements`, branch `feature/oc-8937-track-id`. **Nessuna modifica al codice dei submodule** (`map-core`, `wm-core`, `wm-types`); i puntatori di `wm-core` e `wm-types` sono stati poi aggiornati dal dev ai rispettivi `main` (vedi notes.md, «Decisioni»).
- Identificatori in inglese; commenti e documentazione in italiano.
- Nessun test automatico nel repo: ogni task si verifica a mano nella demo (`npm run start:demo`, http://localhost:4300 se avviata con `-- --port 4300`) o nella pagina di test dopo `npm run build:test:wm-layer-map`.
- **Nessun commit, push o PR durante l'esecuzione**: i passi «Commit» sono testo per il dev, eseguiti solo dopo il review-gate.
- Commit: `feat(oc:8937): …` / `docs(oc:8937): …`.
- Senza `track-id` il widget deve comportarsi esattamente come oggi.
- Dati di prova: shard `camminiditalia`, app `1`, layer `117` (Cammino d'Etruria Centro), traccia `1186` (Tappa 01).

## Review Focus

1. `track-id` vuoto, non numerico, `0` o negativo → nessuna selezione, nessun errore (Task 3, verifica 2.5).
2. Visitatore che clicca una traccia prima della selezione iniziale → vince il suo click (Task 3, verifica 2.6).
3. `track-id` inesistente (es. `99999999`) → si vede il layer, il widget resta usabile (Task 3, verifica 2.4).
4. Caricamento a cache vuota: la traccia resta centrata, lo zoom iniziale sul layer non la annulla (Task 4, verifica 4.1).
5. Più widget nella stessa pagina condividono lo store: lo scenario con `track-id` sta in una pagina di test separata, altrimenti aprirebbe la traccia anche negli altri scenari (Task 4).

---

### Task 1: getter della mappa OpenLayers su `WmLayerMapDirective`

**Files:**
- Modify: `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` (costruttore alla riga 40)

**Interfaces:**
- Produces: `get olMap(): OlMap | undefined` — restituisce `this._mapCmp.map` (`map` di `WmMapComponent`, `undefined`/`null` finché map-core non l'ha creata). `OlMap` è `Map` da `ol`, con lo stesso import usato in map-core.

- [ ] **Step 1: aggiungere il getter** con un commento in italiano: la mappa può non esistere ancora (map-core la crea dopo un `delay(250)`), chi la legge deve gestire il valore assente.
- [ ] **Step 2: verificare la compilazione** — con la demo avviata, la console di `ng serve` deve dire `Compiled successfully`.

### Task 2: input `track-id` e selezione iniziale nel componente

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts` (input alle righe 103-112, blocco `apply` alle righe 385-394)

**Interfaces:**
- Consumes: `WmLayerMapDirective.olMap` (Task 1); `updateEcTrack(trackId: number | undefined): void` (riga 503, invariata); `this._urlHandlerSvc.getCurrentQueryParams(): Params`.
- Produces: `@Input('track-id') trackIdAttr?: string`; metodi privati `_parseTrackId(): number | null`, `_selectInitialTrackAfterRender(attempt: number): void`, `_selectInitialTrack(trackId: number): void`.

- [ ] **Step 1: `@Input('track-id') trackIdAttr?: string`** accanto agli altri input, con lo stesso stile (`…Attr`).
- [ ] **Step 2: `_parseTrackId(): number | null`** — restituisce il numero solo se `Number(trackIdAttr.trim())` è un intero `> 0`, altrimenti `null`.
- [ ] **Step 3: `_selectInitialTrackAfterRender(attempt: number)`** — se `_parseTrackId()` è `null` esce. Se `this._wmLayerMapDirective.olMap` non esiste, riprova ogni 50 ms fino a 40 tentativi (stessi valori di `MAP_READY_POLL_*` della direttiva), poi rinuncia senza errori. Quando la mappa c'è: `once('rendercomplete')`, poi `once('moveend')` oppure `setTimeout` di 1500 ms, chi arriva prima; un flag impedisce la doppia chiamata. Poi `_selectInitialTrack(id)`.
- [ ] **Step 4: `_selectInitialTrack(trackId: number)`** — se `getCurrentQueryParams().track` è già valorizzato non fa nulla (il visitatore ha già scelto), altrimenti `this.updateEcTrack(trackId)`.
- [ ] **Step 5: chiamare `this._selectInitialTrackAfterRender(0)`** subito dopo `this._wmLayerMapDirective.apply(...)`, dentro lo stesso `subscribe` del `combineLatest` (così non parte se il layer non esiste o non ha bbox).
- [ ] **Step 6: verifica** — la console di `ng serve` dice `Compiled successfully`; il comportamento si verifica al Task 3, quando la demo ha il campo.

### Task 3: campo `track-id` nella demo

> ⚠️ L'implementazione ha deviato da questo task: [notes.md](notes.md#task-3-verifiche-in-demo)

**Files:**
- Modify: `src/app/demo/demo.component.ts` (campi alle righe 15-33, `applyPreview` alle righe 35-43, `embedSnippet` alle righe 46-52)
- Modify: `src/app/demo/demo.component.html` (form alle righe 1-8, widget alle righe 9-17)

**Interfaces:**
- Consumes: input `track-id` (Task 2).
- Produces: `trackId = ''` e `previewTrackId = this.trackId` nel `DemoComponent`.

- [ ] **Step 1: campo** `<label>track-id <input [(ngModel)]="trackId" /></label>` dopo `layer-id`; `applyPreview()` copia `trackId` in `previewTrackId`.
- [ ] **Step 2: binding** `[track-id]="previewTrackId || null"` su `<app-wm-layer-map-root>`.
- [ ] **Step 3: snippet** — in `embedSnippet`, dopo `layer-id`: `...(this.trackId ? [\`track-id="${this.trackId}"\`] : [])`.
- [ ] **Step 4: verifiche in demo** (shard `camminiditalia`, app `1`, layer `117`):
  - 2.1 `track-id` `1186`: traccia evidenziata, mappa centrata sulla traccia, dettaglio aperto; lo snippet mostra `track-id="1186"`.
  - 2.2 chiudendo il dettaglio la mappa mostra tutto il layer; un click su un'altra traccia funziona come oggi.
  - 2.3 `track-id` vuoto: identico a oggi, snippet senza `track-id`.
  - 2.4 `track-id` `99999999`: si vede il layer, il widget resta usabile.
  - 2.5 `track-id` `abc`, `0`, `-3`: nessuna selezione, nessun errore in console oltre a quello già noto di `ol_key`.
  - 2.6 con DevTools in «Slow 4G», cliccare una traccia diversa da 1186 appena compare: resta aperta quella cliccata.

### Task 4: pagina di test separata per `track-id`

> ⚠️ L'implementazione ha deviato da questo task: [notes.md](notes.md#task-4-verifiche-sulla-pagina-di-test)

**Files:**
- Create: `test/wm-layer-map/track-id.html` — una sola istanza: shard `camminiditalia`, app `1`, layer `117`, `track-id="1186"`, con i marker `<!-- BEGIN bundle tags -->` / `<!-- END bundle tags -->`.
- Modify: `scripts/sync-test-page.js` — aggiorna tutti i file `test/<widget>/*.html` che contengono i marker, non solo `index.html`; errore solo se nessun file li contiene.

**Interfaces:**
- Consumes: input `track-id` (Task 2).

Perché una pagina a parte: tutte le istanze di una pagina condividono lo store (`bootstrap-widget.ts`), quindi in `index.html` il `track-id` aprirebbe la traccia anche negli altri tre scenari.

- [ ] **Step 1: creare `track-id.html`** sul modello di `index.html`, con titolo `Scenario track-id (layer 117, traccia 1186)`.
- [ ] **Step 2: estendere `sync-test-page.js`** come sopra; il messaggio finale elenca i file aggiornati.
- [ ] **Step 3: build** — `nvm use && npm run build:test:wm-layer-map`; atteso: build senza errori e messaggio che cita `index.html` e `track-id.html`.
- [ ] **Step 4: verifiche con un server statico dalla root del repo** (`python3 -m http.server 8766`):
  - 4.1 `track-id.html` da desktop: 5 caricamenti su 5 con traccia 1186 evidenziata, centrata e dettaglio aperto; almeno uno a cache vuota (DevTools → «Disable cache»).
  - 4.2 stessa pagina a 400 px di larghezza: il dettaglio copre il widget, chiudendolo si vede il layer. *Superato: layout mobile a metà aggiunto dopo il piano, vedi [notes.md](notes.md#decisioni).*
  - 4.3 `index.html`: i tre scenari identici a prima.
- [ ] **Step 5: hash dei bundle** — `git checkout test/wm-layer-map/index.html` se il diff è solo negli hash (oc:8240 non li ha committati); `track-id.html` si committa con gli hash della build corrente.

### Task 5: documentazione nel repo

**Files:**
- Modify: `README.md` (riga 39 attributi della demo, riga 111 attributi opzionali ed eventi)
- Modify: `CLAUDE.md` (riga 36, «Convenzioni di test» alla riga 45)

- [ ] **Step 1: README** — `track-id` fra gli attributi della demo e fra gli attributi opzionali; una riga: «`track-selected` parte anche all'avvio quando è presente `track-id`»; una riga: «supportato un solo `<wm-layer-map>` per pagina (le istanze condividono lo store)».
- [ ] **Step 2: CLAUDE.md** — correggere la riga 36 («un'istanza per elemento, nessuno stato condiviso tra istanze»): una sola applicazione per pagina, store condiviso fra le istanze; in «Convenzioni di test» aggiungere lo scenario `track-id` in `test/wm-layer-map/track-id.html`.

### Commit (solo dopo il review-gate e il sì esplicito del dev)

```bash
git add src/app/wm-layer-map src/app/demo test/wm-layer-map/track-id.html scripts/sync-test-page.js
git commit -m "feat(oc:8937): add track-id attribute to wm-layer-map"
git add README.md CLAUDE.md docs/
git commit -m "docs(oc:8937): document track-id and one widget per page"
```
