# CLAUDE.md — wm-elements

## Cos'è questo repo

Webcomponent embeddabili Webmapp costruiti con Angular Elements, che riusano i componenti condivisi di `wm-core`/`map-core` invece di reimplementarli in vanilla JS (a differenza dei widget precedenti come `webmappsrl/wm-layer-map`, lasciato invariato). Un solo repo pensato per ospitare più widget nel tempo — il primo è `<wm-layer-map>`.

## Stack

- **Framework:** Angular 20 (Angular Elements, `@angular/elements`)
- **Store:** NgRx (@ngrx/store, @ngrx/effects) — montato per intero da `wm-core`, non a sottoinsiemi di slice, per evitare selector orfani nei componenti riusati
- **Mappa:** OpenLayers, tramite direttive di `map-core`
- **Submodule:**
  - `src/app/shared/map-core` — componenti e utils OpenLayers
  - `src/app/shared/wm-core` — store, servizi, componenti UI condivisi (pannello dettaglio, slope chart, POI)
  - `src/app/shared/wm-types` — tipi TypeScript condivisi

## Riferimento ad altri repo per map-core/wm-core

Per qualsiasi dubbio implementativo su come usare correttamente componenti/direttive/selector di `map-core` o `wm-core` (pattern d'uso, wiring dello store, edge case non ovvi dai soli sorgenti dei submodule), ispezionare i repo `wm-webapp` e `webmapp-app` — sono le app reali che consumano gli stessi submodule e mostrano l'uso "canonico" di riferimento. La loro posizione varia da utente a utente: localizzarli con una `find` prima di usarli, ad esempio `find ~ -maxdepth 4 -type d \( -name wm-webapp -o -name webmapp-app \) 2>/dev/null`.

## Parità di comportamento con webapp/app mobile

Qualsiasi comportamento visibile del widget (colori, zoom, interazioni, dati mostrati, ecc.) che risulti **diverso** da quello della webapp (`wm-webapp`) o dell'app mobile (`webmapp-app`), a parità di shard/app/layer, è **da considerare un bug o un errore di configurazione**, mai una variazione accettabile "di prodotto". Il widget riusa gli stessi submodule (`map-core`/`wm-core`) e gli stessi dati/config delle altre app: se il rendering diverge, la causa è quasi sempre in come `wm-elements` collega/consuma quei submodule (binding mancanti, default diversi, differenze di encapsulation come lo Shadow DOM), non un comportamento "intenzionalmente diverso". Quando si investiga una discrepanza, il riferimento va sempre cercato in `wm-webapp`/`webmapp-app` (vedi sezione sopra) prima di introdurre una spiegazione alternativa.

## Architettura submoduli

Ordine di dipendenza: `wm-types` → `wm-core` → `wm-elements` (stessa convenzione di `wm-webapp`)

- Stessi path alias di `wm-webapp`: `@map-core/*` → `src/app/shared/map-core/src/*`, `@wm-core/*` → `src/app/shared/wm-core/projects/wm-core/src/*`, `@wm-types/*` → `src/app/shared/wm-types/src/*`
- **Nessuna modifica ai submodule è prevista**: si importa direttamente da `src/*` via alias, esattamente come fa `wm-webapp` (i submodule non espongono un `public-api.ts` completo, ma l'accesso diretto ai sorgenti è il pattern già in uso e consolidato)

## Differenze rispetto a wm-webapp

`wm-elements` non è un'app Ionic completa: niente routing, niente pagine, niente store applicativo per home/UGC/editing. È una libreria di webcomponent minimale:

- `src/main.ts` — bootstrap dell'injector isolato (`createApplication` + `createCustomElement`), un'istanza per elemento, nessuno stato condiviso tra istanze. **Un widget = un entry point**: un futuro widget avrà un proprio `src/main-<widget>.ts`, mai aggiunto allo stesso bundle di un altro (vedi Build multi-widget sotto).
- `src/app/wm-layer-map/` — componente root del widget `wm-layer-map` e relativi servizi (config fetch, ecc.)
- `src/app/services/local-url-handler.service.ts` — shim che sostituisce `UrlHandlerService` di `wm-core` via DI override (`{provide: UrlHandlerService, useClass: LocalUrlHandlerService}`), per evitare la dipendenza da `Router`/`ActivatedRoute` reali e non manipolare mai l'URL della pagina host
- `test/<widget>/index.html` — pagina di verifica manuale per widget (nessun test automatico Karma/Jasmine in questo repo: la logica di dominio è già coperta dai test dei submodule, qui si fa solo composizione/wiring UI)
- `scripts/publish-dist.sh <widget>` — pubblicazione manuale del bundle di un singolo widget su una sottocartella dedicata del branch `dist` stabile + tag Git per rollback (URL jsDelivr fissa, non cambia mai per il cliente); non tocca gli altri widget già pubblicati
- `scripts/sync-test-page.js <widget>` — rigenera i tag `<link>/<script>` di `test/<widget>/index.html` dal vero output di build (gli hash dei bundle cambiano ad ogni build)

## Convenzioni di test

Nessuna suite automatica dedicata in questo repo (decisione presa in fase di design, vedi `docs/features/8252-wm-layer-map-angular/overview.md`). Verifica solo manuale tramite `test/<widget>/index.html`, con scenari fissi: layer solo-tracce, layer tracce+POI, `hide-cta` attivo, lingua non italiana.

## Sviluppo quotidiano

Non modificare direttamente il bundle custom-element per iterare — non ha hot reload. Usa `npm run start:demo` (`ng serve --configuration=demo`): monta gli stessi componenti come normali componenti Angular bootstrappati in una pagina demo con controlli per gli attributi (`shard`, `app-id`, `layer-id`, ecc.), con reload istantaneo ad ogni modifica. La build "elements" (`npm run build:<widget>`, vedi sotto) va verificata solo prima di pubblicare o quando si tocca qualcosa di specifico del custom element (Shadow DOM, mapping attributi, eventi).

**Versione Node richiesta**: Angular 20 CLI richiede Node `>=20.19.0` (vedi `.nvmrc` e `engines` in `package.json`). Se il sistema ha una versione più vecchia (es. Node 18, che fa fallire `ng serve`/`ng build` con un errore esplicito di versione minima), usare `nvm` invece di reinstallare Node globalmente:

```sh
nvm install   # legge .nvmrc, installa/scarica la versione se non già presente
nvm use       # attiva quella versione nella shell corrente (va rifatto per ogni nuova shell)
```

`nvm use` va eseguito in ogni nuova sessione di shell prima di lanciare `npm run start:demo`/`npm run build:*`, perché non persiste tra shell diverse.

## Build multi-widget

Il repo ospita più widget nel tempo — ognuno con build, output e distribuzione indipendenti dagli altri, mai un bundle unico condiviso:

- Ogni widget ha una propria `build` configuration in `angular.json` (`architect.build.configurations.<widget-name>`) che imposta `main`/`index`/`outputPath: "dist/<widget-name>"` dedicati.
- Comando: `npm run build:<widget-name>` (es. `npm run build:wm-layer-map`) → `ng build --configuration=production,<widget-name>`.
- Aggiungere un nuovo widget: creare `src/main-<widget>.ts` + `src/index-<widget>.html`, una nuova configuration in `angular.json` sul modello di `wm-layer-map`, i corrispondenti script `build:<widget>`/`build:test:<widget>` in `package.json`, e `test/<widget>/index.html` come pagina di verifica.
- Mai un `ng build` generico senza specificare la configuration del widget: userebbe `main`/`outputPath` di base (`dist/wm-elements`), non associati a nessun widget pubblicabile.

## Distribuzione

- Repo pubblico su GitHub (richiesto da jsDelivr `/gh/`)
- Ogni widget pubblica il proprio bundle in una sottocartella dedicata del branch `dist` (`dist/<widget>/` sul branch, non da confondere con l'output locale `dist/<widget>/` nella working copy), servita via jsDelivr con URL fissa per widget — il cliente non deve mai aggiornare il proprio embed. Pubblicare un widget non tocca gli altri già pubblicati.
- `ng build` per un widget richiede sempre `--deploy-url` puntato al suo URL jsDelivr finale (gestito da `publish-dist.sh`, mai nella build locale/test): con `<script type="module">` il browser non espone `document.currentScript`, quindi senza `deployUrl` esplicito eventuali chunk caricati lazy da `wm-core`/`map-core` verrebbero richiesti relativi alla pagina del cliente invece che al CDN (404 su ogni sito che embedda il widget).
- Ogni pubblicazione crea anche un tag Git (`dist-<widget>-YYYYMMDD-HHmm`) per poter fare rollback ripuntando `dist` a un tag precedente invece di un force-push distruttivo — un rollback di un tag ripunta l'intero branch (tutti i widget allo stato di quel momento), non un singolo widget isolato.

## Feature disponibili

| Feature | Ticket | Moduli toccati | Note |
|---|---|---|---|
| Direttiva related POI riscritta (fuori da map-core) | — | `src/app/wm-layer-map/directives/track-related-pois.directive.ts`, `src/app/wm-layer-map/directives/ol.ts` | Sostituisce la legacy `WmMapTrackRelatedPoisDirective` di map-core nel widget: selettore `wmelMapTrackRelatedPois`, firma identica, selezione single-writer |

## Decisioni architetturali

### Riscrittura direttiva track related POI (riscrittura-direttiva-track-related-pois)

- **Il widget non usa più `WmMapTrackRelatedPoisDirective` di map-core**: la direttiva è riscritta in `src/app/wm-layer-map/directives/track-related-pois.directive.ts` (selettore `wmelMapTrackRelatedPois` — mai riusare quello legacy: `WmCoreModule` esporta `WmMapModule`, stesso selettore = doppia istanza sullo stesso host). Contratto completo in `docs/features/riscrittura-direttiva-track-related-pois/overview.md`.
- **Selezione single-writer**: l'unico canale che pilota la selezione visiva è il binding `[related-current-ec-poi-id]` dallo store; click e `poiNext()`/`poiPrev()` emettono soltanto (`related-poi`) e la selezione torna dal round-trip URL/store. Non reintrodurre mai scritture imperative `setPoi = ...` via ViewChild: erano la causa del bug storico di riapparizione del POI dopo deselezione.
- **Click via dispatcher centrale di map-core** (`registerDirective` + `wmMapEmptyClickEVT$`), non `map.on('click')`: il dispatcher instrada al layer con z-index più alto al pixel — i layer related usano `CLUSTER_ZINDEX + 1/+2` per vincere sui POI globali. Attenzione: `wmMapEmptyClickEVT$` è un `ReplaySubject(1)`, serve la guardia "solo se c'è selezione attiva" per non deselezionare all'init.
- **`directives/ol.ts`**: funzioni pure di rendering marker (foto→icona→PNG), stessa convenzione di `map-core/src/utils/ol.ts` — nome scelto perché l'intento futuro è portare direttiva e funzioni upstream in map-core.
- **TypeScript allineato a wm-webapp (`~5.8.0`), non aggiornare a ≥5.9 da solo**: con TS 5.9 le lib tipizzano `Uint8Array.buffer` come `ArrayBufferLike` e `map-core/src/utils/ol.ts` (`_loadVectorTileBuffer`) smette di compilare (TS2322 `SharedArrayBuffer` vs `ArrayBuffer`) — wm-webapp con TS 5.8 compila lo stesso file senza errori. Bump di TS possibile solo insieme a (o dopo) un fix upstream in map-core.

### wm-layer-map Angular (oc:8252)

- **Store montato per intero, non a slice**: i componenti riusati (`wm-track-properties`, `wm-track-related-poi`, `wm-slope-chart`) fanno selector su più slice di `wm-core`; scegliere manualmente "solo quelli necessari" rischia selector orfani ogni volta che un componente cambia. Si monta l'intero `StoreModule`/`EffectsModule` di `wm-core`.
- **`LocalUrlHandlerService` implementa tutti e 6 i metodi realmente usati in `wm-core`** (`updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`), non solo quelli usati dai componenti visibili nella UI — perché montare tutti gli effects (vedi punto sopra) attiva anche `user-activity.effects.ts`, che inietta lo stesso servizio. I 3 metodi meno ovvi sono innescati solo da action di feature fuori scope (home/UGC), ma vanno comunque implementati per non lasciare `undefined` che crasha silenziosamente se in futuro qualcosa li innesca.
- **Nessuna dipendenza da Router/ActivatedRoute reali**: lo shim tiene lo stato di selezione (POI/traccia) in un `BehaviorSubject` locale invece che nell'URL della pagina host — requisito esplicito per un widget embeddato su siti di terzi.
