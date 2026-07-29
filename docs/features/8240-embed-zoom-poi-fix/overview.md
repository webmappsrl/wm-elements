> Ticket: oc:8240

# EMBED — fix zoom minimo e POI mancanti su widget wm-layer-map

## Cosa cambia

Due fix comportamentali sul widget `<wm-layer-map>`, segnalati dal cliente Cammini d'Italia sull'embed pubblicato (caso d'uso di riferimento: `shard=camminiditalia app-id=1 layer-id=40`, "Cammino Grande di Celestino"):

1. **Zoom minimo meno restrittivo**: in `wm-layer-map.directive.ts` il `minZoom` della view viene oggi fissato dinamicamente uguale allo zoom risultante dal `fit()` sul bbox del layer (`view.setMinZoom(view.getZoom())`), impedendo qualsiasi dezoom oltre la vista che inquadra l'intero cammino. Il fix imposta `minZoom = zoom(fit) - 1`, clampato a `MAP.minZoom` della config (letto da `conf.ts`, valore 6 per lo shard `camminiditalia` — scala Italia) come limite invalicabile.
3. **Margine sul bbox per i punti estremi**: il bbox del layer viene oggi usato "grezzo" sia per il `fit()` iniziale sia per il vincolo di pan (`extent` della `View`, con `constrainOnlyCenter: false`) — i punti di partenza/arrivo del cammino risultano sempre appiccicati al bordo del viewport, difficili da cliccare. Il fix allarga il bbox del 10% per lato (in proiezione EPSG:3857, calcolato su larghezza/altezza dell'extent) prima di usarlo sia per il fit sia per il vincolo di pan, dando margine cliccabile agli estremi senza introdurre un `padding` in pixel separato (che non risolverebbe il vincolo di pan).
2. **POI sempre visibili, a prescindere dallo zoom**: la vera causa dei POI mancanti non è l'aggregazione da tappe, ma un threshold esistente in `map-core/src/directives/pois.directive.ts` (`_checkZoom`): il layer POI viene nascosto (`layer.setVisible(false)`) quando lo zoom corrente è sotto `wmMapConf.pois.poiMinZoom` (per lo shard `camminiditalia` vale `11`, fallback hardcoded `15` se assente). Il fit del layer 40 produce uno zoom sotto quella soglia, quindi il layer POI risultava nascosto. Il fix forza `poiMinZoom = 5` trasformando l'observable `confMap$` in `wm-layer-map.component.ts` (operatore RxJS `map()`), **non** tramite override DI di `ConfService`: il binding `[wmMapConf]="confMap$|async"` in `wm-layer-map.component.html` alimenta con lo stesso oggetto sia `<wm-map>` sia la direttiva `wmMapPois` (di map-core) attaccata allo stesso host — bastava intercettare quell'unico punto, senza toccare `ConfService`/DI/bootstrap. Nessuna modifica al submodule `map-core`.
   **Nota tecnica:** la lettura della soglia in `pois.directive.ts` è `+this.wmMapConf?.pois?.poiMinZoom || 15` — in JavaScript `0` è falsy, quindi un override a `0` ricadrebbe silenziosamente sul fallback hardcoded `15`, vanificando il fix. Per questo si usa `5` (valore troncato ma non falsy): combinato con `MAP.minZoom` globale (6) e il fatto che il fit di un singolo cammino produce quasi sempre uno zoom più alto, la soglia risulta sempre soddisfatta nei casi reali senza incorrere nel bug del `||`.
   **Decisione presa durante l'esecuzione:** l'approccio iniziale (approvato in Fase: challenge) prevedeva un `WidgetConfService` che estendesse `ConfService` via override DI in `bootstrap-widget.ts`. Si è scoperto durante la verifica manuale che `npm run start:demo` usa un bootstrap Angular separato (`bootstrap-demo.ts`) che non eredita quell'override — la demo avrebbe mostrato un comportamento diverso dal widget reale. Il binding locale su `confMap$` risolve il problema a monte: stesso comportamento in demo e nel widget pubblicato, meno codice, nessun rischio di impattare altri consumatori futuri di `ConfService`.

## Perché

Il cliente ha segnalato entrambi i problemi via commento sul ticket dopo aver embeddato il widget in produzione su `camminodicelestino.it`: la mappa "si blocca" (zoom minimo troppo restrittivo) e i POI non compaiono sul layer 40. Il layer 40 è usato solo come caso d'uso di riferimento per notare il problema — il fix è generale, applicato a tutti i layer del widget.

## Requisiti

- [ ] `minZoom` della view = zoom risultante dal `fit()` sul bbox del layer, meno 1
- [ ] `minZoom` calcolato non scende mai sotto `MAP.minZoom` della config (clamp difensivo; nel caso concreto camminiditalia/layer 40 il clamp non scatta mai in pratica, dato che il fit di un singolo cammino produce uno zoom ben più alto di 6)
- [ ] `pois.poiMinZoom` viene forzato a `5` nell'observable `confMap$` di `wm-layer-map.component.ts`, evitando il bug del `|| 15` su valore falsy (`0`) presente in `pois.directive.ts`
- [ ] Nessuna modifica al submodule `map-core` (la logica di `_checkZoom` resta invariata, riceve semplicemente una soglia sempre soddisfatta)
- [ ] Bbox del layer allargato del 10% per lato (larghezza/altezza dell'extent in EPSG:3857) prima di essere usato per `view.fit()` e per il vincolo `extent` della `View` — richiesta emersa dopo la verifica visiva del fix POI/zoom, non presente nel commento originale del cliente ma nello stesso ambito "usabilità dell'embed"

## Rischi

- Il clamp a `MAP.minZoom` è una guardia difensiva che, per il caso d'uso segnalato, non si attiva mai (fit di un singolo cammino >> zoom 6): resta comunque nel codice per shard/layer con bbox molto ampi dove potrebbe attivarsi.
- Forzare `poiMinZoom` a `5` per tutti gli shard rimuove un comportamento pensato (probabilmente) per non affollare la mappa di marker a zoom molto bassi su layer con moltissimi POI: è una scelta di prodotto esplicita del cliente/dev per questo ciclo, non una svista — da tenere presente se in futuro altri clienti lamentano l'effetto opposto (troppi marker a zoom bassi).
- Il valore `5` non è un "sempre visibile" letterale, ma una soglia molto bassa che risulta soddisfatta nei casi osservati oggi (bbox di un singolo cammino, `MAP.minZoom` globale = 6). Bbox futuri con fit-zoom < 5 (layer molto estesi, es. reti di cammini aggregate) potrebbero ripresentare lo stesso sintomo — non è una garanzia strutturale, va rivalutato se emergono nuovi casi.
- Nessun meccanismo di opt-in/opt-out per singolo shard/layer: il fix è globale per tutta la base clienti attuale e futura del widget.

## Out of scope

- Introduzione di un modello dati tipizzato per le "tappe" (stage) di un cammino, oggi assente in wm-core/wm-types/wm-webapp — richiesto anche dalla description originale del ticket ma rimandato a un ciclo successivo per non ritardare la fix dei due bug segnalati dal cliente in produzione.
- UI dedicata per visualizzare/selezionare le tappe come tracce distinte sulla mappa.
- Override parziale della configurazione per la gestione della visualizzazione delle tappe (parte descritta nella description originale del ticket, non nel commento del cliente).

## Moduli toccati

- `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` — logica `minZoom` (fit - 1, clamp a `MAP.minZoom`)
- `src/app/wm-layer-map/wm-layer-map.component.ts` — `confMap$` trasformato per forzare `pois.poiMinZoom = 5`
