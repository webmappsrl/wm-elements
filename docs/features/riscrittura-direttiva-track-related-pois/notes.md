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

## Errore TS2322 in map-core/src/utils/ol.ts (risolto con allineamento TypeScript)

`_loadVectorTileBuffer` (`return stringToUint8Array(cached).buffer`) non compilava **solo in questo repo**: con TypeScript 5.9 le lib tipizzano `Uint8Array.buffer` come `ArrayBufferLike` e `SharedArrayBuffer` non è più assegnabile ad `ArrayBuffer` (narrowing di `[Symbol.toStringTag]`). wm-webapp compila lo stesso file senza errori perché usa TS 5.8.

Cronologia: esisteva un workaround locale non committato nel submodule (copia dei byte in un nuovo `ArrayBuffer`), andato perso durante la sessione (discard IDE, non da comandi git di questo workflow). **Risoluzione definitiva**: TypeScript allineato a wm-webapp — `typescript@~5.8.0` in `package.json` (installato 5.8.3, identico a wm-webapp). Il submodule compila pulito senza alcuna modifica locale. Nessuna PR upstream più necessaria per questo punto (l'errore riapparirebbe solo se wm-elements aggiornasse TS a ≥5.9 prima di map-core).

## Incidente publish CDN 2026-07-15 (risolto: loader su manifest entries.json)

La pubblicazione post-merge ha rivelato un difetto del meccanismo di distribuzione (preesistente, non della feature): il loader `wm-layer-map.js` risolveva i nomi hashati dei bundle tramite la **Data API di jsDelivr**, che cacha il listing del branch con `max-age` di **un anno** e la cui risoluzione branch→commit all'origine resta inchiodata a un commit stantio a tempo indeterminato (verificato: >15h dopo il publish, anche le risposte fresche — `x-cache: MISS` — risolvevano ancora la generazione precedente di bundle, ormai cancellata dal branch → 404 → widget non caricato). Ripubblicare non aiuta: la cache è keyed sull'URL e non viene invalidata dai push; `purge.jsdelivr.net` copre solo `cdn.jsdelivr.net`, non la Data API.

**Fix** (nessun cliente ancora impattato, embed non condiviso):
- `publish-dist.sh` genera `entries.json` (manifest dei nomi hashati correnti) nella cartella pubblicata;
- `widget-loader.template.js` legge il manifest da `raw.githubusercontent.com` (cache ~5 min, nessuna risoluzione jsDelivr di mezzo) con fallback sul sibling `entries.json` via `cdn.jsdelivr.net` (purgato ad ogni publish);
- il publish conserva la **generazione precedente** di bundle accanto alla nuova (grazia per manifest stale ≤5 min); le generazioni più vecchie decadono.

## Follow-up

- **Porting in map-core**: intenzione dichiarata del dev di portare in futuro la nuova direttiva (e le sue funzioni pure) upstream in map-core. Per questo il modulo marker è stato chiamato `directives/ol.ts`, stessa convenzione di `map-core/src/utils/ol.ts` — segnala che i due file sono omologhi e destinati a convergere.
- Verifica manuale completa (Task 5 del piano: scenari demo, check memoria, smoke test superficie non usata con binding temporanei, build cross-origin) — da eseguire dal developer; le parti automatizzabili (tsc, grep legacy, build elements, sync test page) sono già passate.
- Il selettore `currentRelatedPoi$` esposto dalla direttiva non è consumato dal widget (che usa lo store `currentEcRelatedPoi`): mantenuto per parità di firma, valutare in futuro se rimuoverlo.
