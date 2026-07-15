# Riscrittura direttiva track related POI fuori da map-core

## Cosa cambia

Il widget `wm-layer-map` smette di usare la direttiva legacy `WmMapTrackRelatedPoisDirective` del submodule `map-core` e monta una **nuova direttiva standalone** scritta da zero nel repo principale:

- File: `src/app/wm-layer-map/directives/track-related-pois.directive.ts` (accanto a `wm-layer-map.directive.ts`, stesso pattern standalone)
- Selettore: **`wmelMapTrackRelatedPois`** — deve essere diverso da `wmMapTrackRelatedPois` perché `WmCoreModule` esporta `WmMapModule` di map-core e la direttiva legacy resterebbe in scope: stesso selettore = doppia istanza sullo stesso host (doppio layer, doppio click handler).
- Firma pubblica **completa e identica alla legacy** (scelta esplicita del dev): tutti gli input (`track`, `related-current-ec-poi-id`, `wmMapPoisPois`, `wmMapPoisFilters`, `wmMapReletedPoisDisableClusterLayer`, `wmTrackRelatedPoiIcons`, `next`, `wmMapPositioncurrentLocation`, `wmMapTrackRelatedPoisAlertPoiRadius`), tutti gli output (`related-poi`, `related-poi-click`, `wmMapTrackRelatedPoisNearestPoiEvt`), API imperativa (`setPoi`, `poiNext()`, `poiPrev()`, `currentRelatedPoi$`).
- Implementazione riscritta secondo best practice OpenLayers 7 / Angular (vedi Requisiti), **non** un porting riga-per-riga del codice legacy.
- **Integrazione col dispatcher centrale dei click di map-core** (decisione da challenge): la direttiva si registra con `mapCmp.registerDirective(...)` come `pois.directive.ts` e riceve i click tramite il routing per z-index di `map.component.ts:438-464`; la deselezione su click a vuoto usa `wmMapEmptyClickEVT$`. Niente `map.on('click')` grezzo come la legacy (che vinceva sul dispatcher solo grazie allo z-index `999999999999999`).
- **Unico scrittore sulla selezione** (decisione da challenge): il solo canale che pilota la selezione visiva è il binding `[related-current-ec-poi-id]` dallo store. Le 4 scritture imperative `setPoi = ...` via ViewChild in `wm-layer-map.component.ts` (righe 407, 440, 452, 476) vengono rimosse; click sul marker e `poiNext()`/`poiPrev()` **emettono** l'id/POI verso il widget (che aggiorna URL/store) e la selezione visiva avviene quando l'id torna dal binding. Elimina alla radice il protocollo a due scrittori concorrenti, fabbrica del bug storico.
- Il template e il `@ViewChild` di `wm-layer-map.component` passano alla nuova direttiva; i binding morti `(related-poi-next)`/`(related-poi-prev)` (output mai esistiti nella legacy) vengono rimossi **dopo verifica dei consumer a valle** (`currentPoiNextID$`/`currentPoiPrevID$` nel componente: se orfani, si rimuovono anche loro).
- Il submodule `map-core` resta **intatto**: il puntatore va a `15c4f21` (l'upstream `develop` già checked-out ed esercitato live su questo branch), eliminando la dipendenza dal commit locale `8a36293` (fix deselezione che non risolve il problema). **Il contratto di comportamento è la Specifica funzionale di questo documento**, autonoma e riproducibile — non un commit del submodule. Il diff locale non committato a `map-core/src/utils/ol.ts` (fix ArrayBuffer vector tile) è estraneo a questa feature: viene documentato in `notes.md` e proposto upstream in un ciclo separato.

Politica dipendenze (**ibrida**, scelta esplicita del dev): la nuova direttiva importa da `@map-core/*` ciò che è pulito e stabile (`WmMapComponent`, `WmMapBaseDirective`, utility pure come `createLayer`, `nearestFeatureOfLayer`, `calculateNearestPoint`, `isArrayContained`, costanti `ICN_PATH`/`DEF_LINE_COLOR`/`CLUSTER_ZINDEX`/`logoBase64`, tipi `PoiMarker`/`IGeojsonFeature`) e riscrive internamente solo le parti che incorporano pattern obsoleti (pipeline canvas dei marker con immagine, `Icon` con `imgSize` deprecato, gestione del layer di selezione).

## Perché

- **Il bug di selezione/deselezione dei related POI non è risolto**: il fix locale `8a36293` sul submodule ("deselezione sincrona") non funziona. Il design legacy rende questa classe di bug strutturale: subscription create dentro il setter `setPoi` (una per chiamata, con `debounceTime(500)`), stato di selezione distribuito su 4 campi (`_lastID`, `_selectedPoiMarker`, `_selectedPoiLayer`, `currentRelatedPoi$`), side-effect asincroni (`await _createPoiMarker`) non annullabili che possono completare dopo una deselezione. L'obiettivo della riscrittura è **prevenire il bug by design**, non rattopparlo.
- **Il branch dipende da un commit locale non-upstream del submodule**, in violazione della convenzione del repo ("nessuna modifica ai submodule è prevista"): chiunque cloni il repo non può fare checkout di quel commit. Portare la logica nel repo principale rimuove la dipendenza.
- **Autonomia evolutiva**: la direttiva legacy è condivisa con webapp e app mobile; ogni fix lì rischia regressioni altrove. Una direttiva di proprietà del widget si può evolvere e correggere in sicurezza.

## Specifica funzionale (cosa fa la direttiva)

Contratto di comportamento della direttiva. **Questa sezione è il riferimento autonomo e completo per la riscrittura** (decisione da challenge: nessuna dipendenza da commit del submodule come "fonte"): il *cosa* è fissato qui, il *come* è libero. Per il rendering, il riferimento visivo resta la webapp a parità di shard/traccia.

### Contesto e ciclo di vita

- Si applica all'host `<wm-map>` e ottiene l'istanza `OlMap` da `WmMapComponent` (via `@Host`), operando solo dopo `isInit$`; si registra nel **dispatcher centrale dei click** (`mapCmp.registerDirective`) per ricevere i click di competenza dei propri layer.
- Riceve la traccia selezionata dall'input `track` (condiviso con `wmMapTrack`): quando la traccia ha `properties.related_pois`, renderizza quei POI come marker su un **layer vettoriale dedicato** (z-index ordinato e documentato, sopra `CLUSTER_ZINDEX` dei POI globali — i related POI devono vincere il routing dei click al pixel — e sotto il layer di selezione).
- **Cambio traccia** (id diverso) o traccia nulla → reset completo: marker rimossi, selezione azzerata, `related-poi` emette `null`. La stessa traccia ri-emessa con **riferimento oggetto nuovo ma id uguale** (caso quotidiano: NgRx ricrea i riferimenti) **non** provoca reset né ricreazione dei marker. `related_pois` assente o array vuoto → nessun layer, nessun errore.
- Alla distruzione (widget smontato dalla pagina host): nessun listener OL né subscription RxJS sopravvive.
- **Isolamento errori**: nessuna eccezione della direttiva fuoriesce nel ciclo eventi OL — un marker che fallisce (foto rotta, CORS sul dominio cliente, dati malformati) non blocca gli altri né le interazioni della mappa.

### Rendering dei marker

Per ogni POI di `related_pois`, il marker è scelto con questa precedenza:

1. **Foto** — se `feature_image.show_image_on_map === true`, oppure è assente ma esiste `feature_image.sizes['108x137']`: marker circolare di 46px con la foto ritagliata in un cerchio con bordo bianco e alone colorato (`DEF_LINE_COLOR`, opacità 0.2 normale / 1 selezionato); se il download della foto fallisce si prosegue con l'icona (punto 2). `show_image_on_map === false` forza l'icona.
2. **Icona SVG** — da `wmTrackRelatedPoiIcons[poi_type.icon_name]` (set di icone dell'app), ricolorata sostituendo `darkorange` con il colore del POI (`poi_type.color` → `properties.color` → default `#ff8c00`, convertito in colore nominato via `fromHEXToColor`); in alternativa `properties.svgIcon` se presente.
3. **Fallback PNG** — `ICN_PATH/<icn>.png` a scala 0.5, dove `<icn>` è il primo identificatore `poi_type_*` dei `taxonomyIdentifiers` (escluso `theme_ucvs`).

Se il POI esiste anche nella sorgente `wmMapPoisPois` (POI globali dell'app), si riusa quella feature OL invece di crearne una nuova (stesso id, niente doppioni sulla mappa). **Attenzione (effetto collaterale ereditato e voluto per parità)**: applicare lo stile related sulla feature riusata muta il rendering dello stesso POI anche nel layer di `wmMapPois` — comportamento della legacy da replicare consapevolmente, non da "correggere" in questo ciclo.

### Selezione

**Unico scrittore**: la selezione visiva è pilotata esclusivamente dall'input `related-current-ec-poi-id` (binding dallo store). Le altre vie d'ingresso **emettono** e la selezione avviene quando l'id torna dal binding (round-trip sincrono via store/URL):

- **Input `related-current-ec-poi-id`** (store/URL): id numerico → seleziona quel POI; `-1`/`null`/`'reset'` → deseleziona (il valore `'reset'` fa parte del contratto legacy: qualsiasi valore non risolvibile a un marker esistente equivale a deselezione).
- **Click sul marker** (via dispatcher centrale): la direttiva riceve il click instradato al suo layer, individua la feature ed emette `related-poi-click(id)` e `related-poi(poi)`; il widget aggiorna URL/store e la selezione visiva arriva dal binding. Le altre direttive non reagiscono al click (routing per z-index del dispatcher).
- **`poiNext()`/`poiPrev()`** (dal pannello, via ViewChild): calcolano il POI successivo/precedente (navigazione circolare su `related_pois`) e lo **emettono** via `related-poi`; nessuna auto-selezione interna. Con selezione nulla sono no-op sicuri (niente TypeError come la legacy).

Effetti della selezione (all'arrivo dell'id dal binding):

- Il marker selezionato è renderizzato in **variante evidenziata** (icona SVG con colori invertiti cerchio/glifo; foto con alone pieno) su un **layer di selezione** separato sopra i marker; il marker normale sottostante resta.
- `fitView` anima la mappa sul POI (durata ~500ms, senza superare lo zoom corrente).
- `currentRelatedPoi$` emette il POI selezionato; `related-poi` emette verso il widget (che apre il pannello).
- Selezionare un POI già selezionato è idempotente: non riesegue effetti (no doppia animazione), ma non deve nemmeno inghiottire selezioni successive diverse.
- Una selezione che arriva **prima che i marker esistano** (init o cambio traccia in corso) resta pendente e si applica appena i marker sono pronti — ma una deselezione o una nuova selezione sopraggiunta la annulla (pipeline unica con `switchMap`, mai subscription parallele).

### Deselezione

- `setPoi = -1` (o `null`/`'reset'`) → rimozione **immediata e definitiva** dell'evidenziazione: qualunque operazione di selezione ancora in volo (creazione marker asincrona, attese su init) viene annullata; `currentRelatedPoi$` e `related-poi` emettono `null`. Il POI non deve mai riapparire da solo.
- Click sulla mappa lontano dai marker (`wmMapEmptyClickEVT$` del dispatcher centrale) → deseleziona il corrente.
- Input `next` → rimuove il layer di selezione (contratto legacy, usato dalla webapp).

### Filtri e visibilità

- `wmMapPoisFilters: string[]` → mostra solo i marker con intersezione tra i filtri e i `taxonomyIdentifiers` del POI; se il POI non li ha, fallback su `poi_type_<taxonomy.poi_type.identifier>`; senza identificatori il POI resta visibile; lista filtri vuota → tutti visibili. I marker non vengono ricreati: si filtra la source esistente.
- `wmMapReletedPoisDisableClusterLayer: boolean` → toggla la visibilità del layer dei marker.

### Nearest POI (posizione utente)

- Quando `wmMapPositioncurrentLocation` cambia: calcola il POI più vicino alla posizione (raggio `wmMapTrackRelatedPoisAlertPoiRadius`), lo evidenzia scalandolo (1.2x) ed emette `wmMapTrackRelatedPoisNearestPoiEvt(feature)`.

### Tabella firma pubblica

| Membro | Tipo | Contratto |
|---|---|---|
| `@Input() track` | `WmFeature<LineString>` | traccia corrente; `properties.related_pois` è la sorgente dei marker |
| `@Input('related-current-ec-poi-id') setPoi` | `number \| 'reset'` | seleziona per id; `-1`/`null` deseleziona (anche via ViewChild) |
| `@Input() wmMapPoisPois` | `WmFeature<Point>[]` | POI globali dell'app: riuso feature per id |
| `@Input() wmMapPoisFilters` | `string[]` | filtro taxonomy sui marker |
| `@Input() wmMapReletedPoisDisableClusterLayer` | `boolean` | nasconde/mostra il layer marker |
| `@Input() wmTrackRelatedPoiIcons` | `{[identifier: string]: string}` | set icone SVG dell'app |
| `@Input() next` | `any` | rimuove il layer di selezione |
| `@Input() wmMapPositioncurrentLocation` | `Location` | posizione utente per nearest POI |
| `@Input() wmMapTrackRelatedPoisAlertPoiRadius` | `number` | raggio alert nearest POI |
| `@Output('related-poi') relatedPoiEvt` | `EventEmitter<WmFeature<Point> \| null>` | POI selezionato / `null` a deselezione o reset |
| `@Output('related-poi-click') poiClick` | `EventEmitter<number>` | id del POI cliccato sulla mappa |
| `@Output() wmMapTrackRelatedPoisNearestPoiEvt` | `EventEmitter<Feature<Geometry>>` | POI più vicino alla posizione |
| `poiNext()` / `poiPrev()` | metodo | navigazione circolare |
| `currentRelatedPoi$` | `BehaviorSubject` | POI corrente o `null` |

## Requisiti

- [ ] Firma pubblica completa identica alla legacy (input/output/metodi/`currentRelatedPoi$` elencati sopra), così da essere drop-in salvo il selettore.
- [ ] Comportamento visibile **identico alla webapp** a parità di shard/traccia (regola di parità del repo): marker con foto (`show_image_on_map` a tre vie: `true` → immagine, `false` → icona, assente → fallback legacy su `sizes['108x137']`), icone SVG colorate da `poi_type.color`/`fromHEXToColor`, inversione colori sul selezionato, fallback PNG `ICN_PATH`, filtro `wmMapPoisFilters` con fallback su `taxonomy.poi_type.identifier`, `fitView` sul POI selezionato, nearest-POI con evidenziazione su `wmMapPositioncurrentLocation`.
- [ ] Selezione/deselezione **deterministica by design**: un'unica fonte di verità sincrona per la selezione (stream unico con `switchMap` che annulla automaticamente le operazioni in volo), rendering idempotente derivato dallo stato, nessuna subscription creata dentro i setter, deselezione con effetto immediato e definitivo.
- [ ] **Unico scrittore sulla selezione**: rimozione delle 4 scritture imperative `setPoi = ...` in `wm-layer-map.component.ts`; click e `poiNext()`/`poiPrev()` emettono verso il widget e la selezione visiva arriva solo dal binding `related-current-ec-poi-id`.
- [ ] **Integrazione col dispatcher centrale dei click** di map-core (`registerDirective` + routing per z-index + `wmMapEmptyClickEVT$`), niente `map.on('click')` grezzo.
- [ ] **Isolamento errori**: nessuna eccezione della direttiva raggiunge il ciclo eventi OL; fallback a icona su qualsiasi fallimento della pipeline foto (incluso CORS su dominio cliente).
- [ ] Best practice OpenLayers 7: niente `imgSize` deprecato (canvas/`src` con dimensioni intrinseche), listener OL registrati con handle e rimossi con `unByKey` in `ngOnDestroy`, layer e source creati una volta e riusati (`source.clear()` + `addFeatures`) invece di `removeLayer`/`addLayer` ad ogni cambio traccia, `zIndex` del layer selezione sopra quello dei marker senza valori assurdi (no `999999999999999`).
- [ ] Ciclo di vita Angular pulito: tutte le subscription RxJS chiuse in `ngOnDestroy` (`takeUntil`/`Subscription` aggregata), nessun leak dopo distruzione del widget (requisito reale per un custom element che può essere smontato/rimontato dalla pagina host).
- [ ] Nessuna modifica ai submodule; puntatore `map-core` ripristinato a `15c4f21` (upstream `develop` già checked-out) nello stesso ciclo; diff locale `ol.ts` documentato in `notes.md` come debito estraneo alla feature.
- [ ] **Porting conservativo** per la superficie non consumata dal widget (nearest-POI, filtri, disable-cluster, `next`): riuso delle utility legacy provate (`calculateNearestPoint`, `isArrayContained`), nessuna reinterpretazione creativa.
- [ ] Template aggiornato: nuovo selettore, stessi binding, rimozione dei binding morti `(related-poi-next)`/`(related-poi-prev)`; `@ViewChild` aggiornato al nuovo tipo.
- [ ] Funziona dentro lo Shadow DOM del custom element (attenzione nota da b2bd6d1: crash canvas in Shadow DOM) sia in build elements sia in demo `ng serve`.
- [ ] Nessun testo visibile all'utente introdotto → nessun lavoro i18n.

### Criteri di accettazione (verifica manuale, demo + test page, confronto side-by-side con wm-webapp)

- [ ] Selezione da click sul marker
- [ ] Selezione da store/URL (`related-current-ec-poi-id`)
- [ ] Next/prev dal pannello POI
- [ ] Deselezione dal pannello e click su altra zona della mappa — il POI non riappare
- [ ] Cambio traccia con reset pulito; ri-selezione della stessa traccia
- [ ] POI con immagine (`show_image_on_map`) e POI con sola icona SVG colorata
- [ ] Check memoria: ~20 cicli selezione/deselezione + cambi traccia ripetuti senza accumulo di **layer, listener OL e subscription** (`map.getLayers().getLength()` stabile + audit dei listener via `getListeners`/log di debug — il leak storico era nelle subscription, non nei layer)
- [ ] **Smoke test in demo con binding temporanei** per la superficie non usata dal widget: `wmMapPoisFilters`, `wmMapReletedPoisDisableClusterLayer`, `wmMapPositioncurrentLocation` + alert radius (nearest POI), `next`, `related-poi-click` — esercitati almeno una volta in `ng serve` demo
- [ ] Build elements verificata da pagina su **origin diverso** (fallback CORS della pipeline foto)

## Rischi

Emersi e affrontati nella fase di challenge (revisione adversariale):

- **Routing dei click rotto da "z-index sani"** — il dispatcher centrale di `map.component.ts` instrada i click alla direttiva del layer con z-index più alto al pixel; la legacy vinceva solo grazie a `999999999999999`. *Mitigazione (decisione)*: integrazione col dispatcher (`registerDirective` + `wmMapEmptyClickEVT$`) e z-index ordinato sopra `CLUSTER_ZINDEX`.
- **Protocollo a due scrittori su `setPoi`** (binding + 4 scritture imperative nel componente) — radice del bug storico, fuori dalla direttiva. *Mitigazione (decisione)*: unico scrittore = binding dallo store; le scritture imperative vengono rimosse; click e next/prev emettono e la selezione torna dal binding.
- **Superficie API non esercitabile nel widget** (filtri, nearest, disable-cluster, `next`, `related-poi-click` non bindati dal template) — codice nuovo mai eseguito. *Mitigazione (decisione)*: firma completa confermata, porting conservativo dalle utility provate + smoke test in demo con binding temporanei.
- **Divergenza comportamentale non rilevata rispetto alla legacy/webapp** — la riscrittura non è un porting riga-per-riga; sfumature (latenza senza debounce, ordine eventi, opacità, anchor, scale) possono differire. *Mitigazione*: il contratto è la Specifica funzionale di questo documento; confronto side-by-side con wm-webapp; in caso di conflitto tra "parità visiva" e "best practice interna", **vince la parità visiva** (regola del repo), la best practice governa solo l'implementazione non osservabile.
- **Doppia istanza della direttiva** se si riusasse il selettore legacy (WmMapModule resta importato via WmCoreModule). *Mitigazione*: selettore nuovo `wmelMapTrackRelatedPois`.
- **Shadow DOM e pipeline canvas dei marker con foto** — già emerso un crash canvas in Shadow DOM (commit b2bd6d1); in più il widget gira su domini arbitrari: fetch immagini cross-origin può fallire. *Mitigazione*: pipeline foto con fallback a icona su qualsiasi errore; verifica esplicita nella build elements da origin diverso, non solo in demo.
- **Worst case produzione** (bundle CDN condiviso da tutti i clienti, nessuna telemetria): un'eccezione nel percorso click potrebbe rompere ogni interazione mappa su ogni embed. *Mitigazione (decisione)*: isolamento errori by design; nessuna pubblicazione in questo ciclo; niente kill-switch runtime (over-engineering accettato come rischio residuo).
- **Input condivisi** (`track`, `wmMapPoisPois`, `wmMapPoisFilters`) raggiungono anche altre direttive sullo stesso host: rinominarli romperebbe il wiring delle altre; la firma completa identica li mantiene condivisi by design. *Mitigazione*: nessuna rinomina degli input; solo il selettore cambia.
- **Ripristino puntatore submodule**: da `8a36293` (locale, non riproducibile) a `15c4f21` (upstream già checked-out e testato live su questo branch — nessun salto comportamentale nuovo). Il rollback sorgente verso `8a36293` resta impossibile da clone pulito: è accettato, perché quel commit è esattamente il difetto che si elimina. *Mitigazione*: grep finale che nessun codice del repo principale referenzi più la direttiva legacy; il contratto vive nell'overview, non nel commit.
- **Mutazione cross-direttiva dello stile** sulla feature OL riusata da `wmMapPois` — comportamento legacy documentato nella spec e replicato consapevolmente per parità.

## Out of scope

- Qualsiasi modifica ai submodule `map-core`/`wm-core`/`wm-types` (la legacy resta disponibile per webapp/app mobile).
- Fix di bug della legacy dentro map-core (il fix locale `8a36293` viene abbandonato, non corretto).
- Nuove feature UI (UI di filtri, clustering, nuovi comportamenti non presenti nella legacy).
- Test automatici (convenzione repo: solo verifica manuale).
- Il resto della UI del widget (pannello POI, galleria, CTA) — già coperto dal lavoro oc:8259.
- **Pubblicazione su CDN** (`publish-dist.sh`): questo ciclo si ferma a codice + verifica manuale; la pubblicazione è un atto manuale separato successivo.
- **Kill-switch runtime** verso la direttiva legacy (deciso in challenge: over-engineering, rischio residuo accettato).
- **Fix upstream del diff locale `map-core/src/utils/ol.ts`** (ArrayBuffer vector tile): estraneo alla feature, documentato in `notes.md`, da proporre a `map-core` in un ciclo separato.

## Moduli toccati

Tutti nel **repo principale `wm-elements`** (feature interamente custom, nessun submodule modificato):

- `src/app/wm-layer-map/directives/track-related-pois.directive.ts` — **nuovo**, la direttiva riscritta
- `src/app/wm-layer-map/directives/ol.ts` — **nuovo**, funzioni pure di rendering marker (stessa convenzione di `map-core/src/utils/ol.ts`, in vista di un futuro porting upstream)
- `src/app/wm-layer-map/wm-layer-map.component.html` — selettore nuovo, rimozione binding morti
- `src/app/wm-layer-map/wm-layer-map.component.ts` — import standalone, `@ViewChild` aggiornato, rimozione delle 4 scritture imperative `setPoi` e degli eventuali subject orfani (`currentPoiNextID$`/`currentPoiPrevID$`)
- `src/main.demo.ts` / `src/index.demo.html` — binding temporanei per lo smoke test della superficie non usata dal widget (rimossi o lasciati come controlli demo a fine ciclo)
- puntatore submodule `src/app/shared/map-core` — ripristino a `15c4f21` (upstream `develop`)
