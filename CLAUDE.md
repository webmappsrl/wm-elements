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

- `src/main.ts` — bootstrap dell'injector isolato (`createApplication` + `createCustomElement`), un'istanza per elemento, nessuno stato condiviso tra istanze
- `src/app/wm-layer-map/` — componente root del widget e relativi servizi (config fetch, ecc.)
- `src/app/services/local-url-handler.service.ts` — shim che sostituisce `UrlHandlerService` di `wm-core` via DI override (`{provide: UrlHandlerService, useClass: LocalUrlHandlerService}`), per evitare la dipendenza da `Router`/`ActivatedRoute` reali e non manipolare mai l'URL della pagina host
- `test/index.html` — pagina di verifica manuale (nessun test automatico Karma/Jasmine in questo repo: la logica di dominio è già coperta dai test dei submodule, qui si fa solo composizione/wiring UI)
- `scripts/publish-dist.sh` — pubblicazione manuale del bundle su un branch `dist` stabile + tag Git per rollback (URL jsDelivr fissa, non cambia mai per il cliente)

## Convenzioni di test

Nessuna suite automatica dedicata in questo repo (decisione presa in fase di design, vedi `docs/features/8252-wm-layer-map-angular/overview.md`). Verifica solo manuale tramite `test/index.html`, con scenari fissi: layer solo-tracce, layer tracce+POI, `hide-cta` attivo, lingua non italiana.

## Sviluppo quotidiano

Non modificare direttamente il bundle custom-element per iterare — non ha hot reload. Usa `npm run start:demo` (`ng serve --configuration=demo`): monta gli stessi componenti come normali componenti Angular bootstrappati in una pagina demo con controlli per gli attributi (`shard`, `app-id`, `layer-id`, ecc.), con reload istantaneo ad ogni modifica. La build "elements" (`ng build`, vedi sotto) va verificata solo prima di pubblicare o quando si tocca qualcosa di specifico del custom element (Shadow DOM, mapping attributi, eventi).

## Distribuzione

- Repo pubblico su GitHub (richiesto da jsDelivr `/gh/`)
- Bundle buildato pubblicato sul branch `dist`, servito via jsDelivr con URL fissa — il cliente non deve mai aggiornare il proprio embed
- Ogni pubblicazione crea anche un tag Git (`dist-YYYYMMDD-HHmm`) per poter fare rollback ripuntando `dist` a un tag precedente invece di un force-push distruttivo

## Feature disponibili

| Feature | Ticket | Moduli toccati | Note |
|---|---|---|---|
| _(da compilare a fine implementazione, vedi oc:8252)_ | | | |

## Decisioni architetturali

### wm-layer-map Angular (oc:8252)

- **Store montato per intero, non a slice**: i componenti riusati (`wm-track-properties`, `wm-track-related-poi`, `wm-slope-chart`) fanno selector su più slice di `wm-core`; scegliere manualmente "solo quelli necessari" rischia selector orfani ogni volta che un componente cambia. Si monta l'intero `StoreModule`/`EffectsModule` di `wm-core`.
- **`LocalUrlHandlerService` implementa tutti e 6 i metodi realmente usati in `wm-core`** (`updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`), non solo quelli usati dai componenti visibili nella UI — perché montare tutti gli effects (vedi punto sopra) attiva anche `user-activity.effects.ts`, che inietta lo stesso servizio. I 3 metodi meno ovvi sono innescati solo da action di feature fuori scope (home/UGC), ma vanno comunque implementati per non lasciare `undefined` che crasha silenziosamente se in futuro qualcosa li innesca.
- **Nessuna dipendenza da Router/ActivatedRoute reali**: lo shim tiene lo stato di selezione (POI/traccia) in un `BehaviorSubject` locale invece che nell'URL della pagina host — requisito esplicito per un widget embeddato su siti di terzi.
