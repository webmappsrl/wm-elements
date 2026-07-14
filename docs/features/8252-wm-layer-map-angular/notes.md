> Ticket: oc:8252

# Notes — wm-layer-map Angular

## Deviazioni dal piano

**Task 1 — dipendenze e configurazione TypeScript più estese del previsto.**

Il piano assumeva che bastasse installare poche dipendenze runtime ovvie (`@ngrx/store`, `@ngrx/effects`, `chart.js`, `ol`, `@ionic/angular`). In pratica sono emerse tre categorie di problemi bloccanti, risolti in questo ordine:

1. **Elenco dipendenze incompleto.** Un giro di ispezione più ampio (confronto con `wm-webapp/package.json`, fonte di verità già funzionante con gli stessi submodule) ha rivelato ~25 package aggiuntivi usati da `wm-core`/`map-core`/`wm-types` (plugin Capacitor, `@ngx-translate/*`, `swiper`, `posthog-js`, `ts-md5`, `geojson-to-kml`, ecc.), non scopribili senza eseguire davvero la build e leggere gli errori `TS2307` uno per uno. Elenco completo installato, versioni allineate a quelle di `wm-webapp`.
2. **`tsconfig.json` troppo strict.** Il generatore Angular 20 (`ng new`) abilita di default `"strict": true` e `useDefineForClassFields: true`. Il codice di `wm-core` è scritto assumendo le impostazioni più permissive già in uso in `wm-webapp` (niente `strict`, `useDefineForClassFields: false`, `moduleResolution` compatibile). Allineato `tsconfig.json` di `wm-elements` a quello di `wm-webapp` (stesse `compilerOptions`, stessi `paths` extra per `@ionic/core`, `@ionic/angular`, `swiper`).
3. **`tsconfig.app.json` includeva l'intero albero dei submodule.** Il default generato usa `"include": ["src/**/*.ts"]`, che forza TypeScript a compilare anche codice morto/non raggiunto (es. `storage.service.ts` con riferimenti Capacitor Filesystem non importati correttamente, `store/conf/mock.ts`) mai effettivamente usato dal nostro widget. `wm-webapp` invece usa `"files": ["src/main.ts", ...]` + `"include": ["src/**/*.d.ts"]`, lasciando che sia il grafo delle import a decidere cosa compilare. Applicato lo stesso pattern — risolve la maggior parte degli errori residui senza dover toccare i submodule.

**Submodule non allineati al commit usato da `wm-webapp`.** `git submodule add` clona di default la punta del branch predefinito di ciascun repo, non il commit specifico già usato/testato in produzione da `wm-webapp`. Per `wm-core` questo significava puntare al branch `change-environment` invece che al commit pinnato in `wm-webapp` (`eeee910...`). Corretto con `git checkout <sha>` sugli stessi commit esatti di `wm-webapp` per tutti e tre i submodule (`map-core`, `wm-core`, `wm-types`), per costruire contro codice già verificato e non contro lavoro in corso.

## Bug trovati

Nessuno nel codice applicativo scritto finora (siamo ancora nel Task 1 — scaffold). I problemi sopra sono di configurazione/dipendenze, non bug nella logica implementata.

## Decisioni

- Dipendenze runtime/dev installate: vedi elenco completo nel commit del Task 1 (`package.json`).
- `tsconfig.json`/`tsconfig.app.json` allineati 1:1 alle impostazioni non-strict di `wm-webapp` invece di lasciare i default di `ng new` — necessario per compilare i submodule senza modificarli.
- Submodule pinnati agli stessi commit esatti di `wm-webapp` (non alla punta dei branch) per garantire di costruire su codice già testato.

## Dipendenze componenti riusati (Task 3)

- `wm-slope-chart` (`@wm-core/slope-chart/slope-chart.component`): nessun tag/var Ionic nel template. `@Input() currentTrack: WmFeature<LineString>`, `@Output('hover') hover`.
- `wm-track-properties` (`@wm-core/track-properties/track-properties.component`): tag Ionic nel template — `ion-header`, `ion-toolbar`, `ion-buttons`, `ion-button`, `ion-icon`, `ion-label`. Nessun `@Input`, completamente store-driven.
- `wm-track-related-poi` (`@wm-core/track-related-poi/track-related-poi.component`): tag Ionic — `ion-button`, `ion-label`. `@Output('poi-click')`.
- **Variabili CSS Ionic usate in totale nei 3 componenti: solo `var(--ion-text-color)`** — porting minimo nello Shadow Root (Task 10), non l'elenco ampio temuto in fase di design.
- **Tag Ionic risolti come componenti Angular veri**, non custom element grezzi: `@ionic/angular` fornisce `IonicModule` con componenti Angular che hanno gli stessi selettori (`ion-button`, `ion-icon`, ecc.). Basta importare `IonicModule` nell'`NgModule` che dichiara/usa i componenti riusati — nessun caricamento separato di runtime custom element nello shadow root.
- `UrlHandlerService`: confermato il rischio di design — richiede `Router`/`ActivatedRoute` reali, usato con 6 metodi in tutto `wm-core` (`updateURL`, `changeURL`, `resetURL`, `setPoi`, `setTrack`, `removeLatest`), non solo dai 3 componenti UI. Risolto con `LocalUrlHandlerService` (Task 4).

## Store isolato e bootstrap (Task 5)

- **`wm-core` è già un `NgModule` completo** (`WmCoreModule.forRoot(...)`): registra da solo tutti i reducer/effects via `StoreModule.forFeature`/`EffectsModule.forFeature` e dichiara ~50 componenti (incluso `wm-slope-chart`, `wm-track-properties`, `wm-track-related-poi`) — molto più semplice del previsto: basta importarlo, non serve elencare manualmente ogni reducer. Import anche `WmMapModule` (`map-core`) al suo interno, quindi tutte le direttive mappa (`wmMapLayer`, `wmMapPois`, `wmMapTrackRelatedPois`, ecc.) arrivano gratis.
- **Standalone component non può usare `ModuleWithProviders`** (risultato di `.forRoot()`) nei propri `imports` (errore Angular NG2012). Split corretto: `WmCoreModule.forRoot(config)` va nei provider root dell'app (via `importProvidersFrom` in `main.ts`), mentre il componente importa solo la classe `WmCoreModule` semplice per rendere disponibili i suoi componenti nel template.
- **`EnvironmentService.init()` risolve shard/appId dall'hostname della pagina** (pensato per il modello "un sottodominio per app" della webapp) — comportamento sbagliato per un widget embeddato su un dominio di terzi con `shard`/`app-id` passati come attributi HTML. Risolto senza toccare `wm-core`: si costruisce un `Environment` con un `redirects[hostname]` fittizio che punta sempre ai valori reali passati come attributi — sfrutta un meccanismo già esistente nel servizio invece di introdurne uno nuovo.
- PostHog disabilitato di default nel widget (`{enabled: false}`) — nessuna richiesta esplicita di tracking su siti di terzi in questo ciclo; se in futuro serve, va deciso esplicitamente (privacy sui siti embeddanti).
- Budget bundle di produzione di Angular (default 500kB/1MB) troppo stretti per una libreria che include Angular+NgRx+Ionic+OpenLayers+Chart.js+Swiper (~2MB reali) — alzati a 2MB/3MB in `angular.json`. L'ottimizzazione della dimensione del bundle resta fuori scope per questo ciclo.

## Cambio builder: esbuild/Vite → Webpack legacy (Task 6)

Durante la verifica end-to-end del Task 6 (demo con `ng serve`) sono emersi in sequenza tre bug di incompatibilità tra librerie CommonJS/UMD datate (`graphhopper-js-api-client`, `localforage`) usate da `map-core`/`wm-core` e il builder moderno **esbuild/Vite** (`@angular/build:application`), generato di default da `ng new` in Angular 20:

- `graphhopper-js-api-client`: `GraphHopperRouting.js` assegna a una variabile globale senza dichiararla (`GraphHopperRouting = function...`), che in ESM strict mode lancia `ReferenceError` — modulo caricato eagerly da `WmMapModule`, blocca l'intera app.
- `localforage`: import con `import * as localforage from 'localforage'` (namespace import) su un modulo CommonJS — esbuild copia solo le proprietà *proprie* dell'oggetto esportato, non quelle sul prototipo (`createInstance` è su `LocalForage.prototype`), causando `TypeError: localforage.createInstance is not a function`.

**`wm-webapp` non li vede** perché usa ancora il builder legacy Webpack (`@angular-devkit/build-angular:browser`), molto più tollerante con questo tipo di codice. Inoltre `wm-webapp` **non importa nemmeno** `graphhopper-js-api-client` via `import` — lo carica come `<script>` globale in `angular.json` (`scripts: [".../graphhopper-client.js"]`) e dichiara sia questa libreria che `localforage` in `allowedCommonJsDependencies`, il vero motivo per cui Webpack non si lamenta.

**Decisione presa con l'utente**: dato il pattern ricorrente (ogni libreria CommonJS/UMD datata usata da `wm-core`/`map-core` rischia di rompersi sotto esbuild), si è scelto di **passare a Webpack legacy** (`@angular-devkit/build-angular:browser`, stessa versione di `wm-webapp`) invece di continuare a patchare singole librerie con `patch-package` una per una. Cambiamenti:

- `angular.json`: builder `build`/`serve`/`test`/`extract-i18n` passati da `@angular/build:*` a `@angular-devkit/build-angular:*`, con lo stesso schema di opzioni di `wm-webapp` (`scripts` con `graphhopper-client.js`, `allowedCommonJsDependencies`, `aot: false` in dev).
- `tsconfig.json`: `module` da `preserve` a `es2020`, `moduleResolution` da `bundler` a `node` (compatibili con Webpack, non con esbuild).
- Rimossa la patch `patch-package` su `graphhopper-js-api-client` e la dipendenza `patch-package` stessa — non più necessarie, il builder legacy tollera il codice originale della libreria senza modifiche.
- **Non serviva alcuna patch per `localforage`**: il problema era specifico dell'interop namespace-import di esbuild, assente con Webpack.

**Bug residui dopo il cambio builder** (non collegati a Webpack vs esbuild, mancavano provider nell'app bootstrap):
- `NG0201: No provider found for HttpClient` → aggiunto `provideHttpClient()` in `main.ts`/`main.demo.ts`.
- `NG0201: No provider found for AngularDelegate` (richiesto da `ModalController` di Ionic) → aggiunto `IonicModule.forRoot()` nei provider (`wm-webapp` lo fa in `app.module.ts`, mancava nel nostro bootstrap standalone).

Verificato end-to-end con un controllo automatico (Playwright headless contro il dev server demo): il componente fetcha `config.json`, risolve il layer (`camminiditalia/1/5` → "Cammino di Don Tonino") e lo renderizza nello Shadow DOM senza errori console.

## Mappa OpenLayers reale (Task 7)

- **`config.MAP` combacia quasi esattamente con `IMAP`** (il tipo atteso da `[wmMapConf]` su `wm-map`): stessi campi (`bbox`, `defZoom`, `minZoom`, `maxZoom`, `controls.tiles` per il layer raster). Si passa `config.MAP` così com'è (con un cast `unknown as IMAP` per i campi opzionali mancanti nel payload reale, tipizzati come obbligatori in `ILAYER`/`IMAP` ma non problematici a runtime) — nessuna ricostruzione manuale di URL raster necessaria, `WmMapComponent` costruisce da solo il layer base leggendo `controls.tiles`.
- **URL PBF preso da `EnvironmentService.pbfUrl`**, già risolto correttamente per il nostro shard/appId grazie al trucco `redirects` del Task 6 — non va ricostruito a mano nel nostro servizio config (rimosse le funzioni `tilesRasterUrl`/`tilesPbfUrl` inizialmente scritte, ridondanti).
- **Altro punto critico di routing trovato**: `WmMapComponent` (in `map-core`, non `wm-core`) inietta `ActivatedRoute` direttamente nel costruttore (`queryParams$ = this._route.queryParams...`), obbligatorio, non opzionale — stesso tipo di rischio identificato in challenge per `UrlHandlerService`, ma stavolta dentro il componente mappa stesso. Risolto con lo stesso pattern: `fakeActivatedRoute` (oggetto con solo `queryParams: of({})`) fornito via `{provide: ActivatedRoute, useValue: fakeActivatedRoute}` — nessun Router reale configurato, nessuna lettura/scrittura dell'URL della pagina host. `queryParams: of({})` fa sì che `params.track` sia sempre `undefined`, cioè il comportamento "nessuna traccia già selezionata" che vogliamo al mount iniziale del widget.
- **Verificato end-to-end con screenshot Playwright**: `wm-map` monta un vero canvas OpenLayers, la traccia del layer (`layer-id=5`, "Tappa 6") è visibile in rosso sul tile raster OpenStreetMap/Webmapp, controlli zoom/scala/attribuzione presenti — comportamento equivalente al widget vanilla originale.
- **Limite noto solo in demo** (non nel widget reale): `EnvironmentService` risolve shard/appId una sola volta all'avvio dell'app (`main.demo.ts`), quindi cambiare shard/app-id nel form della demo non aggiorna l'URL PBF già risolto — serve un refresh della pagina demo per testare uno shard diverso. Il widget reale (`main.ts`) non ha questo limite: legge gli attributi dal DOM prima di bootstrappare, una volta, correttamente.

## POI del layer (Task 8)

- **Errore iniziale evitato grazie a una revisione dell'utente**: la prima bozza filtrava i POI lato client con `properties.layers.includes(layerId)`. Verificato nel codice reale (`WmMapPoisDirective._updatePois()` in `map-core`) che questo **non è il filtro usato dalla webapp**: la direttiva filtra internamente per taxonomy (`this._currentLayer?.taxonomy_activities`/`taxonomy_themes`, letti dall'input `[wmMapLayerLayer]` già passato) combinata con `wmMapInputTyped`/`wmMapPoisFilters` — non esiste un filtro per appartenenza al layer basato su `properties.layers` da nessuna parte nel core.
- **Corretto**: `WmLayerMapPoiService.loadPois()` ora restituisce semplicemente tutti i POI dell'app (stesso feed globale che usa `wm-webapp`, via `EnvironmentService.awsPoisUrl`), passati interamente a `[wmMapPoisPois]` — è la direttiva stessa a decidere quali mostrare in base al layer corrente, esattamente come nella webapp. Nessuna logica di filtro POI-per-layer duplicata nel nostro codice.
- Selezione POI: `(currentPoiEvt)` della direttiva emette il POI cliccato → pannello dettaglio locale (nome, descrizione) nello Shadow DOM, chiuso da un bottone `✕` — stesso pattern comportamentale del widget vanilla originale (pannello laterale al click).

## Filtro POI per layer — root cause reale e fix (revisione post-Task 8)

La sezione "Falso allarme chiarito (non un bug)" sopra è **sbagliata**: concludeva che il comportamento (tutti i POI dell'app visibili, non filtrati per layer) fosse fedele alla webapp. L'utente ha verificato che `wm-webapp`, con lo stesso `config.json`, filtra correttamente i POI per layer — quindi il problema era reale.

**Investigazione (confrontando col codice reale di `wm-webapp`, stesso submodule `wm-core`/`map-core`):**

- La prima ipotesi (taxonomy) era ugualmente sbagliata: `extractFilterTaxonomies(layer)` (`user-activity.reducer.ts:108-118`) calcola il filtro da **tre** campi (`taxonomy_wheres`, `taxonomy_activities`, `taxonomy_themes`), non due — ma nessuno dei 118 layer del `config.json` reale (`camminiditalia/1`) li ha popolati. Conferma che il meccanismo `wmMapPois`/selettore `ecPois` (filtro solo su questi campi) **non è mai stato pensato per filtrare per layer**: `currentLayer`/`ecLayer` non compare in nessun punto della sua catena di selettori (`ec.selector.ts:95-114`).
- **Il meccanismo reale**: `wmMapTrackRelatedPois` (`map-core/src/directives/track.related-pois.directive.ts:241-257`) legge `currentTrack.properties.related_pois`, incorporati **lato server** nel JSON della traccia (`EcService.getEcTrack(id)` → `GET https://wmfe.s3.eu-central-1.amazonaws.com/<shard>/tracks/<id>.json`, non `<shard>/<app-id>/tracks/...` — attenzione al pattern URL, `awsApi` non include il segmento app-id per questo endpoint), già filtrato per layer via query Elasticsearch server-side. Nessun filtro client-side.
- Un "cammino"/layer in questo modello EC è backed 1:1 da una traccia con lo **stesso id numerico** (`layer-id=63` → `EcService.getEcTrack(63)` restituisce "Cammino dei Protomartiri Francescani - Tappa 01" con 5 `related_pois` reali — verificato scaricando `.../camminiditalia/tracks/63.json`).
- Il nostro template aveva **già** `wmMapTrackRelatedPois` cablata correttamente (stesso pattern di `wm-core/geobox-map`), ma il `track$` da cui dipende restava vuoto finché l'utente non cliccava manualmente una traccia — per un widget "un layer = un cammino" va selezionata automaticamente all'avvio.

**Fix applicato** (`wm-layer-map.component.ts`/`.html`, nessuna modifica a submodule):
1. `ngOnInit()`: `this._urlHandlerSvc.updateURL({layer: this.layerId, track: this.layerId})` (prima solo `{layer: this.layerId}`) — seleziona anche la traccia corrispondente al layer, attivando `EcEffects.currentEcTrack$` già esistente senza bisogno di click.
2. Rimossi dal template `wmMapPois`/`[wmMapPoisPois]`/`[wmMapPoisPoi]`/`[WmMapPoisUnselectPoi]`/`(currentPoiEvt)` e dal componente `pois$`/`loadEcPois()`/`currentEcPoiId$`/`resetSelectedPoi$`/il metodo `setPoi()` — quel meccanismo mostrava sempre tutti i POI dell'app, mai filtrati per layer, ed era la causa del bug.
3. Verificato che il pannello dettaglio POI (`currentPoi$`, selettore `poi` = `currentEcPoi ?? currentEcRelatedPoi`) continua a funzionare: senza `wmMapPois`, `currentEcPoiId` resta sempre `null`, quindi il selettore ricade su `currentEcRelatedPoi` (alimentato da `wmMapTrackRelatedPois`, non da `ecPois`) — nessuna regressione.

**Revisione su richiesta esplicita dell'utente**: la direttiva `wmMapPois` è stata ripristinata nel template (non rimossa come al punto 3) — l'utente ha chiesto esplicitamente di non toglierla. Per non reintrodurre il bug originale, `[wmMapPoisPois]` non è più alimentata da `pois$`/selettore `ecPois` (feed globale) ma da un nuovo `layerPois$ = this._store.select(currentEcRelatedPois)` — lo stesso selettore che espone i `related_pois` della traccia corrente già usato da `wmMapTrackRelatedPois`, quindi la direttiva resta ma i dati sono comunque filtrati per layer. Ripristinati anche `currentEcPoiId$`, `resetSelectedPoi$`, `setPoi()` necessari al binding.

**Nota per la prossima verifica**: con entrambe le direttive (`wmMapPois` e `wmMapTrackRelatedPois`) attive sulla stessa sorgente dati (`currentEcRelatedPois`), è probabile che i marker vengano duplicati sulla mappa (due feature separate per lo stesso POI). Non ancora confermato visivamente — allo zoom usato nello screenshot di verifica (layer 63) i marker non erano visibili nell'area inquadrata. Da verificare con zoom sulla zona esatta dei POI, e se confermato scegliere se tenere solo una delle due direttive per il rendering marker (l'altra resterebbe solo per next/prev navigazione).

**Verifica end-to-end (Playwright headless)**: layer-id `63` (`camminiditalia/1`), caricamento senza click — il pannello `wm-track-properties` mostra la sezione "Places" con i POI reali della traccia (Fontanella in Largo battaglione Manni, Fontana Convento di San Simeone, Fontana pubblica Vocabolo Colle, Fontana pubblica a Piazza San Giovanni, +1 non visibile nello screenshot) invece dei ~455 POI dell'app. Comportamento corretto confermato.

**Bug preesistente scoperto durante la verifica (non nel nostro codice, fuori scope di questo fix)**: errore console `TypeError: Cannot read properties of null (reading 'getContext')` in `createIconFeatureFromHtml` (`map-core/src/utils/ol.ts:469`, chiamato da `WmMapTrackDirective._init` per gli iconi di inizio/fine traccia, e verosimilmente anche dai marker POI) — la funzione cerca `document.getElementById('canvas')`, elemento assente nel nostro `index.html`/`index.demo.html`. Probabile causa per cui i marker POI non sono visibili sulla mappa nonostante i dati siano correttamente filtrati (confermato dalla lista "Places" nel pannello dettaglio traccia). Da correggere in un ciclo successivo (probabilmente basta aggiungere un `<canvas id="canvas" hidden>` nell'index, verificare prima se serve dimensionarlo).

**Regressione di layout scoperta e corretta nella stessa sessione**: selezionare automaticamente la traccia all'avvio fa sì che il pannello dettaglio (`*ngIf="ecTrack$|async"`) sia sempre aperto fin dal primo caricamento — prima si apriva solo dopo un click esplicito, quindi nessuno aveva notato che `.panel` (`wm-layer-map.component.scss`) era un normale figlio flex del container, senza `position`. Con contenuto lungo (descrizione, galleria, grafico) il pannello spingeva `<wm-map>` fuori dalla viewport (mappa non più visibile, solo il dettaglio traccia a tutta pagina). Corretto rendendo `.panel` un overlay (`position: absolute; right: 0; width: var(--wm-panel-width, 360px)`), coerente con la CSS custom property `--wm-panel-width` già prevista dal contratto pubblico di theming (Task 10). Verificato con screenshot Playwright: mappa e pannello coesistono correttamente.

## Riscrittura su base wm-geobox-map (Task 8, revisione)

Dopo aver notato che il widget ricostruiva a mano un sottoinsieme di direttive su `<wm-map>` (rischio di dimenticare wiring che `wm-core` già gestisce correttamente — vedi i bug del Task 5-7), su indicazione esplicita dell'utente **il componente è stato ricreato copiando `wm-core/geobox-map/geobox-map.component.{ts,html,scss}`** e togliendo solo le feature fuori scope (UGC draw/track/poi, record traccia GPS, download tile offline, posizione utente/geolocalizzazione, hitmap, filtri di ricerca, selezione lingua a runtime). Motivazione esplicita dell'utente: **massimo riuso di ciò che è già in `wm-core`, il nuovo/specifico del widget resta solo nel nostro componente** (store isolato, bootstrap, branding).

Scartata l'idea di `class WmLayerMapComponent extends WmGeoboxMapComponent`: il costruttore della classe originale richiede `GeolocationService`/`ModalController`/`AlertController`/`DeviceService` (Capacitor/Ionic) che vogliamo escludere — con `extends` quel costruttore girerebbe comunque, reintroducendo il tipo di dipendenze Capacitor già rimosse a fatica nei task precedenti. Preferito copy+trim mirato.

**Catena reale scoperta per popolare mappa/layer/POI (nessuna reimplementazione manuale)**:
- `loadConf()` → `ConfEffects.loadConf$` fetcha `ConfService.getConf()` (usa `EnvironmentService.confUrl`, già risolto correttamente) → dispatcha `loadConfSuccess({conf})` con l'intero payload (non solo `MAP`).
- Selezione layer: `LocalUrlHandlerService.updateURL({layer: id})` dispatcha `currentEcLayerId` → **`ConfEffects.updateLayer$`** (già esistente, non nostro) risolve il layer da `confMAP.layers` e dispatcha `setLayer({layer})` → popolato `ecLayer` (in `user-activity.selector`, NON in `ec.selector` — import da correggere se si ripete l'errore) → alimenta `[wmMapLayerLayer]`.
- Click traccia: `updateEcTrack(trackId)` → `updateURL({track: trackId})` → `currentEcTrackId` → **`EcEffects.currentEcTrack$`** (già esistente) fetcha `EcService.getEcTrack(id)` e dispatcha `loadCurrentEcTrackSuccess` → alimenta `currentEcTrack`/pannello `wm-track-properties`.
- POI: `loadEcPois()`+`loadIcons()` (Task 8 originale) → selettore `ecPois` (arricchisce con `svgIcon` dallo store icone) → `[wmMapPoisPois]`.
- Nessun fetch manuale nel nostro componente: solo dispatch delle action giuste, tutto il resto (fetch, parsing, error handling) è già in `wm-core`.

**Pannelli dettaglio (traccia/POI) tenuti fuori da `<wm-map>`, come sibling** — stesso pattern di `map.page.html` (`wm-track-properties` e `webmapp-poi-popup` sono siblings di `wm-geobox-map`, non children):
- Traccia: `<wm-track-properties>` reale (store-driven, nessun @Input), mostrato `*ngIf="ecTrack$|async as ecTrack"`.
- POI: **non esiste un componente `wm-core` pubblico equivalente a `webmapp-poi-popup`** (quello vero è custom-applicativo di `wm-webapp`, fuori dai submodule, con editing/UGC che non vogliamo). Ricostruito un pannello minimale usando però componenti `wm-core` reali per i contenuti (`wm-tab-image-gallery` per la galleria, `wm-inner-component-html` per la descrizione HTML) — solo il wrapper (apertura/chiusura, titolo) è nostro codice, non un componente wm-core mancante.

**Bug corretto durante la riscrittura**: `:host { ... }` invece di `wm-geobox-map { ... }` nel file scss copiato — con `ViewEncapsulation.ShadowDom` il selettore basato sul vecchio tag-name non si applica più al nuovo componente (`app-wm-layer-map-root`), il contenitore mappa risultava a `width/height: 0` ("No map visible because the map container's width or height are 0").

**Falso allarme chiarito (non un bug)**: sembrava che i POI "non fossero filtrati per layer" (si vedevano tutti i 455 POI dell'app zoomando). Verificato nel codice reale di `WmMapPoisDirective._updatePois()`: il filtro esiste **solo** su `taxonomy_activities`/`taxonomy_themes` del layer — se assenti nel `config.json` (come nel layer di test), **nessun filtro si applica, comportamento nativo della direttiva**, identico a quanto farebbe la webapp con lo stesso layer/dataset. Il motivo per cui a zoom ampio si vedono pochi marker sulla webapp reale è `_checkZoom()` + `wmMapConf.pois.poiMinZoom` (qui `11`) — nasconde l'intero layer POI sotto quella soglia di zoom, non filtra per appartenenza al layer. Il nostro widget passa già `config.MAP` per intero (incluso `pois.poiMinZoom`), quindi il comportamento è già fedele, nessuna correzione necessaria.

## Filtro POI per layer — correzione definitiva (layer-id ≠ track-id)

**Errore commesso e corretto nella stessa sessione**: avevo assunto che `layer-id` coincidesse numericamente con un `track-id` (`EcService.getEcTrack(layerId)`), verificato "funzionante" su un solo caso (`layer-id=63` → titolo di traccia plausibile). L'utente ha verificato che il titolo della traccia risultante **non corrispondeva al layer** (`config.json` layer 63 = "Cammino dei Tre Villaggi", ma `getEcTrack(63)` restituiva "Cammino dei Protomartiri Francescani" — coincidenza di id, bbox in regioni diverse). L'assunzione era sbagliata.

**Meccanismo reale** (verificato chiamando direttamente l'API Elasticsearch usata da `wm-webapp`): un layer/cammino può avere **più tracce** ("tappe"). `wm-webapp` le ottiene con una query Elasticsearch filtrata lato server (`EcService.getQuery({layer: {id}})`, `&layer=<id>`), innescata **automaticamente** da un effect già esistente in `wm-core` (`triggerQueryOnInput$` in `store/user-activity/user-activity.effects.ts:172-193`) non appena lo store imposta `ecLayer` (cioè non appena si dispatcha `{layer: this.layerId}` via `LocalUrlHandlerService`, già fatto in `ngOnInit`) — **nessuna azione aggiuntiva da dispatchare manualmente**, il meccanismo esistente si attiva da solo.

**Fix definitivo** (`wm-layer-map.component.ts`):
- Rimosso il dispatch errato `track: this.layerId`.
- `layerPois$` ora: seleziona `ecTracks` (selettore `state.hits`, popolato dall'effect sopra con le tappe del layer) → per ciascuna tappa fetcha il dettaglio via `EcService.getEcTrack(hit.id)` (stesso metodo già usato altrove, iniettato direttamente, nessuna action/effect nuovo scritto) → combina i `related_pois` di tutte le tappe → arricchisce ciascun POI con `svgIcon` replicando **esattamente** la stessa logica di enrichment del selettore `ecPois` (`ec.selector.ts`), perché i `related_pois` grezzi della traccia non passano per quel selettore e quindi non hanno l'icona SVG risolta (causa del bug "cluster corretti ma senza icone" osservato subito dopo il fix del filtro).
- La direttiva `wmMapPois` è stata mantenuta (richiesta esplicita dell'utente: "non devi inventarti codice, la webapp ha già un meccanismo, usa quello") — alimentata da questo `layerPois$` invece che dal feed globale `ecPois`.

**Nuovo problema noto, non ancora risolto**: con `wmMapPois` e `wmMapTrackRelatedPois` entrambe attive sugli stessi POI (quando l'utente clicca una tappa e la traccia diventa "corrente"), compare `AssertionError: The passed 'feature' was already added to the source` in `_updatePois` (`map-core/src/directives/pois.directive.ts`) — probabile duplicazione di feature OpenLayers tra le due directory sulla stessa sorgente vettoriale. Da investigare/risolvere in un ciclo successivo: probabilmente va scelta una sola directory per il rendering marker (l'altra resterebbe solo per la navigazione next/prev nel pannello).

## Finalizzazione build e setup iniziale

Obiettivo: un secondo developer deve poter clonare il repo, avviare il progetto e produrre la build del webcomponent senza intoppi. Modifiche:

- **`.nvmrc`** (`20.20.2`) e **`engines.node` in `package.json`** (`>=20.19.0`): il requisito minimo di Angular CLI 20 non era documentato da nessuna parte — causa di un blocco reale in questa stessa sessione (Node 18 di default via Homebrew).
- **`README.md`** riscritto da zero (era ancora il boilerplate di `ng new`): prerequisiti, setup con submodule, comandi quotidiani (`start:demo`) vs build di produzione (`build`), troubleshooting per l'errore di versione Node.
- **Bug scoperto e corretto in `wm-layer-map.component.ts`**: `ng build` (produzione, AOT strict) falliva con `NG8001: 'ion-progress-bar' is not a known element` — il componente importava `WmCoreModule` ma non `IonicModule` nei suoi `imports` standalone (serviva solo come provider in `main.ts`/`main.demo.ts`, non bastava per il type-checking del template). `npm run start:demo` non lo segnalava perché la config `demo` non è AOT-strict allo stesso modo. Aggiunto `IonicModule` agli `imports` del componente.
- **Budget bundle**: alzato da 2MB a 3MB (warning non bloccante, +238KB oltre il limite precedente) in `angular.json`.
- **Bug scoperto e corretto in `test/index.html`**: referenziava `dist/wm-elements/browser/main-<hash>.js` (struttura da builder esbuild, ormai superata dal passaggio a Webpack legacy documentato sopra) e **un solo tag `<script>`** — con Webpack legacy servono invece `runtime.js` + `polyfills.js` + `scripts.js` (graphhopper) + `main.js` + `styles.css`, tutti con hash diversi ad ogni build, altrimenti il custom element non si registra silenziosamente (nessun errore in console, il modulo webpack pushato nell'array del chunk non viene mai eseguito perché manca il runtime). Creato **`scripts/sync-test-page.js`** + script npm **`build:test`** (`ng build && node scripts/sync-test-page.js`) che rigenera automaticamente i tag `<link>/<script>` in `test/index.html` leggendoli dal vero `dist/wm-elements/index.html` generato da Angular — nessun hash da aggiornare a mano.
- Verificato end-to-end con Playwright: `npm run build:test` seguito da un server statico su `test/index.html` registra correttamente `<wm-layer-map>`, dispatcha `ready`, e mostra le tappe/POI del layer di test (`layer-id=63`, aggiornato anche il default della pagina di test).

## Correzione architetturale: build/distribuzione mono-bundle → multi-widget

**Errore commesso e corretto nella stessa sessione**: la prima versione di finalizzazione build (`README.md`, `scripts/publish-dist.sh`) trattava il repo come se ospitasse un solo bundle indifferenziato (`dist/wm-elements/`, un singolo branch `dist` senza sottocartelle). L'utente ha fatto notare che `wm-elements` è esplicitamente pensato per ospitare **più widget nel tempo** (vedi `## Cos'è questo repo` in CLAUDE.md, scritto fin dall'inizio del progetto) — con quel design, pubblicare un secondo widget in futuro avrebbe *cancellato* il primo (lo script faceva `rm -rf` sull'intero contenuto del branch `dist` prima di ricopiare), e i due widget avrebbero condiviso lo stesso bundle JS (nessun modo di embeddare solo uno dei due sul sito di un cliente).

**Fix**:
- `angular.json`: aggiunta una build `configuration` dedicata per widget (`"wm-layer-map"`: `main`/`index`/`outputPath: "dist/wm-layer-map"`), composta con `production` (`ng build --configuration=production,wm-layer-map`) — pattern da ripetere per ogni nuovo widget, invece di un output generico condiviso.
- `package.json`: script rinominati per widget (`build:wm-layer-map`, `build:test:wm-layer-map`) invece di un generico `build`/`build:test` ambiguo.
- `test/index.html` spostato in `test/wm-layer-map/index.html` — un widget, una pagina di verifica, stessa convenzione di `dist/<widget>/`.
- `scripts/sync-test-page.js` reso parametrico (`node scripts/sync-test-page.js <widget>`) invece di path hardcoded su `dist/wm-elements`.
- `scripts/publish-dist.sh` riscritto per accettare un nome widget come argomento obbligatorio, pubblicare **solo la sottocartella di quel widget** sul branch `dist` condiviso (`dist/<widget>/` sul branch), lasciando intatte le sottocartelle degli altri widget già pubblicati. Tag di rollback anche questi per-widget (`dist-<widget>-YYYYMMDD-HHmm`).

**Bug reale scoperto durante la verifica di questa correzione (non legato al multi-widget, ma alla consegna via CDN in generale)**: con `<script type="module">`, `document.currentScript` è sempre `null` — Webpack non può quindi dedurre da solo il `publicPath` per i chunk caricati lazy (usati internamente da `wm-core`/`map-core`), e li richiederebbe relativi alla pagina del cliente invece che al CDN, causando 404 su ogni sito che embedda il widget. Risolto passando esplicitamente `--deploy-url=<url-jsdelivr-finale>` **solo** nella build di pubblicazione (`publish-dist.sh`), mai nella build di test locale (altrimenti la verifica locale proverebbe a scaricare asset da un URL CDN che non esiste ancora). Verificato con `grep` sul bundle `runtime.js` buildato con `--deploy-url` che il publicPath incorporato è effettivamente quello del CDN.

**Bug minore trovato e corretto in `scripts/sync-test-page.js`**: il controllo di idempotenza (`if (updated === testHtml)`) confondeva erroneamente "nessun marker trovato nel file" con "marker trovato ma contenuto già aggiornato" (build identiche producono hash di bundle identici, quindi il replace produce output invariato) — falso errore bloccante su rebuild ripetute senza modifiche al codice. Corretto separando il controllo di esistenza del marker (`markerPattern.test(...)`) dalla scrittura vera e propria.

**Limite noto, accettato come tale**: la verifica locale (`build:test:<widget>`, senza `--deploy-url`) non risolve correttamente eventuali chunk lazy (stesso motivo sopra) — restano un 404 innocuo in locale. La registrazione del custom element e il comportamento base restano comunque verificabili; il comportamento cross-site reale va confermato solo con `--deploy-url` (fatto una volta con build manuale, verificato via `grep` sul bundle, non ripetuto ad ogni sessione di sviluppo).

## Stato a fine sessione / Follow-up

- **Filtro POI per layer**: risolto correttamente (vedi sezione dedicata sopra), verificato end-to-end sia in demo (`start:demo`) sia sulla build reale del webcomponent (`build:test`).
- **Setup/build**: `README.md`, `.nvmrc`, `engines`, `scripts/sync-test-page.js` completati e verificati end-to-end — un nuovo developer può clonare, fare setup e produrre la build seguendo solo il README.
- **Da risolvere nel prossimo ciclo**:
  - `AssertionError: feature already added to source` — probabile duplicazione marker tra `wmMapPois` e `wmMapTrackRelatedPois` quando entrambe renderizzano gli stessi POI (vedi sezione dedicata sopra).
  - Bug preesistente `getContext`/canvas mancante (icone start/end traccia, vedi sopra) — impatta la resa visiva dei marker.
  - Task 9 (Shadow DOM theming/CSS custom properties/CSS Parts pubblici) e Task 10 (badge app/CTA/store — non ancora riportato nel componente basato su `geobox-map`, verificare se va riaggiunto nel template), pipeline dist (branch/tag), verifica manuale finale sui 4 scenari (solo-tracce, tracce+POI, hide-cta, lingua non-IT).
- Nessun commit fatto durante questa sessione — l'utente decide quando committare (non chiedere conferma ad ogni task, vedi memoria `feedback_commit_timing`).
- Se si aggiorna in futuro un submodule, ripetere la disciplina: pinnare a un commit noto (non alla punta del branch) e rilanciare `ng build` per scoprire nuove dipendenze mancanti prima di procedere.
- Quando il repo ospiterà più di un widget, aggiungere alla demo un menu laterale per scegliere quale widget provare (oggi prematuro: c'è solo `wm-layer-map`).
- Limite noto solo in demo (non nel widget reale): `main.demo.ts` risolve shard/appId una sola volta all'avvio — cambiare i campi nel form della demo non aggiorna l'URL PBF già risolto, serve un refresh pagina per testare uno shard diverso.
