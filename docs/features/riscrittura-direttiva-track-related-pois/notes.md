# Notes — Riscrittura direttiva track related POI

## Deviazioni dal piano

- Il campo `_relatedPois` era usato nel codice del Task 2 ma la sua dichiarazione mancava nel listato del piano — aggiunta (`private _relatedPois: WmFeature<Point>[] = [];`). 
- Il modulo marker previsto dal piano come `track-related-pois.markers.ts` è stato rinominato in `directives/ol.ts` su richiesta del dev dopo la verifica in demo (coerenza di convenzione con `map-core/src/utils/ol.ts`, vedi Follow-up). Nessun'altra deviazione: i file corrispondono al piano.
- I passi "Commit" dei task non sono stati eseguiti durante l'implementazione (override del workflow Webmapp): tutti i commit avvengono al review-gate dopo approvazione del developer.

## Bug trovati

- Nessun bug nuovo trovato durante l'implementazione. Il bug storico di riapparizione del POI dopo deselezione è eliminato by design (unico scrittore + pipeline `switchMap` + guardie epoch post-`await`), non tramite patch.

## Decisioni

Divergenze consapevoli dalla legacy (documentate anche nella self-review del piano):

- **Ramo `else if (svgIcon)` omesso**: nella legacy era irraggiungibile (`svgIcon` derivava dalla stessa `taxonomy` che abilitava il ramo precedente).
- **`related-poi` non ri-emesso a ogni selezione da binding**: emesso solo su click, next/prev e deselezione — il widget è l'unico consumer e usa l'evento solo per aggiornare URL/store; ri-emetterlo a ogni round-trip dal binding creerebbe un ciclo.
- **Nessun `debounceTime(500)`**: la selezione pendente aspetta `_markersReady$` (deterministico) invece di un timer; latenza di selezione ridotta rispetto alla legacy (differenza osservabile ma migliorativa, non una divergenza di rendering).
- **Guardia su `wmMapEmptyClickEVT$`**: è un `ReplaySubject(1)` che ripropone l'ultimo click a vuoto alla subscribe — si emette deselezione solo se c'è una selezione attiva, altrimenti l'init deselezionrebbe da solo un deep-link.
- **Reset traccia**: `related-poi(null)` viene emesso solo se c'era una selezione attiva, per non cancellare un deep-link `ec_related_poi` all'avvio (la traccia arriva dopo il parametro URL).

## Diff locale submodule map-core (estraneo alla feature)

`src/app/shared/map-core/src/utils/ol.ts` ha un diff locale **non committato** in `_loadVectorTileBuffer`: copia dei byte in un nuovo `ArrayBuffer` invece di ritornare `.buffer` della vista Uint8Array (fix per un mismatch di tipo/offset sul buffer cache-ato in localStorage). Non è parte di questa feature:

- NON scartarlo con checkout/reset del submodule.
- Follow-up: proporlo upstream a `webmappsrl/map-core` come PR separata.

## Follow-up

- **Porting in map-core**: intenzione dichiarata del dev di portare in futuro la nuova direttiva (e le sue funzioni pure) upstream in map-core. Per questo il modulo marker è stato chiamato `directives/ol.ts`, stessa convenzione di `map-core/src/utils/ol.ts` — segnala che i due file sono omologhi e destinati a convergere.
- Proporre upstream il fix `ol.ts` del submodule di cui sopra (ciclo separato).
- Verifica manuale completa (Task 5 del piano: scenari demo, check memoria, smoke test superficie non usata con binding temporanei, build cross-origin) — da eseguire dal developer; le parti automatizzabili (tsc, grep legacy, build elements, sync test page) sono già passate.
- Il selettore `currentRelatedPoi$` esposto dalla direttiva non è consumato dal widget (che usa lo store `currentEcRelatedPoi`): mantenuto per parità di firma, valutare in futuro se rimuoverlo.
