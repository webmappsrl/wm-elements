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
| _(da compilare a fine implementazione, vedi oc:8252)_ | | | |

## Decisioni architetturali

### wm-layer-map Angular (oc:8252)

- **Store montato per intero, non a slice**: i componenti riusati (`wm-track-properties`, `wm-track-related-poi`, `wm-slope-chart`) fanno selector su più slice di `wm-core`; scegliere manualmente "solo quelli necessari" rischia selector orfani ogni volta che un componente cambia. Si monta l'intero `StoreModule`/`EffectsModule` di `wm-core`.
- **`LocalUrlHandlerService` implementa tutti e 6 i metodi realmente usati in `wm-core`** (`updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`), non solo quelli usati dai componenti visibili nella UI — perché montare tutti gli effects (vedi punto sopra) attiva anche `user-activity.effects.ts`, che inietta lo stesso servizio. I 3 metodi meno ovvi sono innescati solo da action di feature fuori scope (home/UGC), ma vanno comunque implementati per non lasciare `undefined` che crasha silenziosamente se in futuro qualcosa li innesca.
- **Nessuna dipendenza da Router/ActivatedRoute reali**: lo shim tiene lo stato di selezione (POI/traccia) in un `BehaviorSubject` locale invece che nell'URL della pagina host — requisito esplicito per un widget embeddato su siti di terzi.
