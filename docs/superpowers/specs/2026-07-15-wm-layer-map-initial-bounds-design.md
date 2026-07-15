# wm-layer-map: bbox iniziale senza zoom animato + vincolo di pan/zoom

## Problema

Oggi, all'avvio del widget `wm-layer-map`, la mappa OpenLayers si inizializza con uno zoom/extent "globale" (app-wide, non legato al layer), e solo dopo — quando il layer viene risolto — `wmMapLayer` (in `map-core`) esegue un `view.fit(...)` **animato** (`duration: 500`) verso il bbox del layer. L'effetto visibile è "la mappa parte zoomata, poi anima verso il layer".

Vogliamo invece che:
1. Il widget parta **già centrato e fittato sul bbox del layer**, senza animazione di zoom visibile.
2. L'utente non possa **dezoomare oltre il livello del fit iniziale** (può zoomare liberamente in avanti).
3. L'utente non possa **spostare il centro della mappa fuori dal bbox iniziale del layer** (pan vincolato al bbox).

## Vincoli architetturali

- Nessuna modifica ai submodule (`map-core`, `wm-core`, `wm-types`) — vedi CLAUDE.md.
- Il pattern esistente per estendere il comportamento di `<wm-map>` è tramite direttive Angular applicate sullo stesso host element (es. `wmMapLayer`, `wmMapPois`, `wmMapTrack`, tutte in `map-core/src/directives/*.ts`, che iniettano `@Host() mapCmp: WmMapComponent` e operano su `mapCmp.map` — API pubblica di OpenLayers).
- `WmMapComponent.map: OlMap` è un campo pubblico (non privato), quindi consumabile da una direttiva esterna al submodule senza modificarlo.
- `extentFromLonLat` è già esportato da `map-core/src/utils` (barrel `utils/index.ts`).

## Design

### Nuova direttiva: `wm-layer-map.directive.ts`

Percorso: `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` (nuovo file, in `wm-elements`, non nel submodule).

- Selettore: `[wmLayerMap]`, standalone, applicata sullo stesso host `<wm-map>` di `wm-layer-map.component.html`, accanto alle direttive esistenti (`wmMapLayer`, `wmMapPois`, `wmMapTrack`, `wmMapTrackRelatedPois`).
- Stesso pattern delle direttive di `map-core`: `constructor(@Host() private _mapCmp: WmMapComponent) {}`.
- Espone un metodo pubblico invocato in modo imperativo dal componente (stesso pattern già in uso per `WmMapTrackRelatedPoisDirective`, richiamata via `@ViewChild` e pilotata da `wm-layer-map.component.ts`, es. `this.WmMapTrackRelatedPoisDirective.setPoi = feature`):

  ```ts
  apply(bbox: [number, number, number, number], maxZoom: number, padding: number[]): void
  ```

  Implementazione:
  1. Costruisce una nuova `View` OL (`import View from 'ol/View'`) con:
     - `projection: 'EPSG:3857'` (coerente con la view creata in `map.component.ts`)
     - `extent: extentFromLonLat(bbox)`
     - `constrainOnlyCenter: true`
     - `showFullExtent: true`
     - `maxZoom` (quello già configurato globalmente — zoom-in resta libero, nessun tetto aggiuntivo)
  2. `this._mapCmp.map.setView(newView)` — sostituisce la view corrente (app-wide) con quella vincolata al layer. Tutte le altre direttive (`wmMapPois`, `wmMapTrack`, ecc.) leggono sempre `mapCmp.map.getView()` "al volo" ad ogni chiamata (verificato: nessuna direttiva mantiene un riferimento cache alla vecchia `View`), quindi la sostituzione è sicura e non richiede altre modifiche.
  3. `newView.fit(extentFromLonLat(bbox), {duration: 0, padding, nearest: true})` — centraggio **istantaneo**, nessuna animazione.
  4. `newView.setMinZoom(newView.getZoom())` — blocca il dezoom oltre il livello appena calcolato dal fit, senza dover reimplementare a mano la matematica di OpenLayers (resolution→zoom).

### Modifiche a `wm-layer-map.component.ts`

- Aggiungere `@ViewChild(WmLayerMapDirective) private _wmLayerMapDirective: WmLayerMapDirective;`
- Nel blocco esistente in `ngOnInit()`, dentro la subscribe di `isConfLoaded` → `confMAPLAYERS`:
  - Sostituire `layers.some(l => +l.id === +this.layerId)` con `layers.find(l => +l.id === +this.layerId)` per ottenere l'oggetto layer completo (con il suo `bbox`).
  - Se il layer non è trovato: comportamento invariato (`error.emit`).
  - Se il layer è trovato e ha un `bbox` valido: **prima** di chiamare `this._urlHandlerSvc.updateURL({layer: this.layerId})` (che è ciò che innesca, in modo asincrono via `ecLayer`/`currentLayer$`, il fit animato di `wmMapLayer`), chiamare `this._wmLayerMapDirective.apply(layer.bbox, conf.maxZoom, padding)`.
    - `conf.maxZoom`: letto da `confMap$` (già disponibile come proprietà della classe) con `take(1)`.
    - `padding`: letto dal selector `padding` di `map-core.selector` (già usato altrove nel componente, `mapPadding$`) con `take(1)`.
  - Se il layer non ha `bbox`: skip, comportamento attuale invariato (nessuna regressione per layer senza bbox).

### Modifiche a `wm-layer-map.component.html`

- Aggiungere l'attributo direttiva `wmLayerMap` sul tag `<wm-map #wmap ...>` esistente (nessun altro cambiamento al template).

## Perché non serve altro

- **Nessuna race condition**: la chiamata a `apply(...)` è imperativa e sincrona rispetto al flusso esistente, e avviene sempre PRIMA del dispatch che innesca il fit animato di `wmMapLayer` — non dipende dall'ordine di `ngOnChanges` tra direttive sullo stesso host (che non è garantito).
- **Il fit animato successivo di `wmMapLayer` diventa un no-op visivo**: quando `wmMapLayer` riceve il layer (in modo asincrono, dopo il nostro `apply`) e chiama il proprio `fitViewFromLonLat(bbox)` con `duration: 500`, il target coincide già con la posizione corrente (impostata da noi con `duration: 0`) → nessun movimento visibile.
- **Non si tocca `wmMapDisableFitView`**: è un input condiviso dalla stessa `WmMapBaseDirective` usata anche da `wmMapTrack`/`wmMapPois` — disattivarlo disabiliterebbe anche lo zoom automatico su selezione di una traccia/POI, comportamento che va preservato.
- **Zoom-to-track / zoom-to-poi continuano a funzionare**: leggono sempre `mapCmp.map.getView()` al momento della chiamata, quindi useranno la nostra `View` vincolata — un click su una traccia/POI potrà comunque centrare l'utente su quella feature, ma sempre dentro i limiti (`extent`/`minZoom`) impostati dal fit iniziale del layer. Nessuna modifica a quelle direttive.
- **Nessuna modifica ai submodule**: unico nuovo file in `wm-elements`, unico punto di consumo dell'API pubblica di `map-core` (`WmMapComponent.map`, util `extentFromLonLat`, API standard di OpenLayers `Map.setView`/`View.fit`/`View.setMinZoom`).

## Edge case

- Layer senza `bbox`: skip, nessuna vista vincolata, comportamento attuale (fit animato di `wmMapLayer`, se presente) rimane invariato.
- Riutilizzo del widget con `layerId` diverso su una nuova istanza: ogni istanza del widget crea la propria `View` — nessuno stato condiviso tra istanze (coerente con l'architettura "un widget = un'istanza isolata").

## Testing

Nessuna suite automatica in questo repo (vedi CLAUDE.md). Verifica manuale via `test/wm-layer-map/index.html` e/o `npm run start:demo`, con scenari:
- Layer con bbox noto: la mappa parte già centrata sul layer, senza animazione di zoom visibile.
- Provare a fare pinch-zoom-out/scroll-out oltre il livello iniziale: il dezoom si blocca al livello del fit.
- Provare a spostare la mappa (pan) lontano dal layer: il centro resta vincolato al bbox iniziale.
- Selezionare una traccia/POI del layer: lo zoom-to-feature continua a funzionare (nei limiti del bbox/minZoom).
- Layer senza bbox (se esiste uno scenario di test per questo): nessuna regressione, comportamento attuale.
