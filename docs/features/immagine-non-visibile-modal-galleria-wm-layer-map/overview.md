# wm-layer-map: immagine non visibile nel modal della galleria

## Cosa cambia

Cliccando su una foto della sezione "Galleria" nel pannello di dettaglio del widget `wm-layer-map`, il modal di ingrandimento mostrerà l'immagine a schermo intero (con contatore e frecce prev/next quando le foto sono più di una), esattamente come avviene nella webapp. Oggi il modal si apre completamente bianco.

## Perché

Bug di parità con la webapp (per convenzione di questo repo ogni divergenza visibile è un bug, mai una variazione di prodotto).

**Causa individuata:** il contenuto del modal (`wm-image-detail`, wm-core) è avvolto da `*ngIf="(currentImageGalleryIndex$|async)"`, dove l'observable è `select(currentEcImageGalleryIndex).pipe(map(index => index + 1))`. Nella webapp il vero `UrlHandlerService.initialize()` dispatcha l'action `currentEcImageGalleryIndex` a ogni cambio del query param `gallery_index`. Lo shim `LocalUrlHandlerService` di wm-elements, in `_dispatchFromParams`, non dispatcha mai quell'action: lo slice resta `undefined` → `undefined + 1 = NaN` → l'`*ngIf` è falsy → il modal renderizza vuoto.

Dettaglio non ovvio: la webapp usa `params.gallery_index ? +params.gallery_index : null` perché i query param URL sono stringhe (`'0'` è truthy). Nello shim i param sono valori raw: con indice `0` (prima foto) un check truthy riprodurrebbe il bug proprio sulla prima immagine — serve `!= null`.

## Requisiti

- [ ] Cliccando una foto della galleria (qualsiasi posizione, inclusa la prima, indice `0`) il modal mostra quella foto
- [ ] Il contatore "N di M" riflette la foto corrente e le frecce prev/next scorrono la galleria aggiornando il contatore
- [ ] Alla chiusura del modal (`gallery_index: null`) lo slice torna `null`, e una riapertura successiva funziona di nuovo
- [ ] Il comportamento è identico tra pagina demo (`npm run start:demo`) e build custom element (`test/wm-layer-map/index.html`)
- [ ] La galleria funziona in tutti i contesti in cui appare: dettaglio traccia, related POI, POI generico

## Rischi

- **Regressione sull'indice `0`:** usare il check truthy della webapp invece di `!= null` farebbe fallire il fix esattamente sulla prima foto. Mitigazione: check esplicito `!= null` + scenario di verifica manuale dedicato alla prima immagine.
- **Modal montato fuori dallo Shadow DOM nella build elements:** `ModalController` di Ionic monta il modal fuori dal custom element; gli stili di `wm-image-detail`/`modal-image` (encapsulation `None`) potrebbero non raggiungerlo nella build elements anche a fix applicato. Mitigazione: il requisito di verifica copre esplicitamente entrambe le build; se emergesse un problema di stili è un difetto distinto da registrare in notes.md.
- **Dispatch aggiuntivi involontari:** aggiungere il dispatch dentro `_dispatchFromParams` lo esegue a ogni variazione di param (anche track/poi). È lo stesso comportamento della webapp (dispatch a ogni cambio di queryParams), quindi coerente; il reducer è idempotente sullo stesso valore.

## Out of scope

- Allineamento completo dello shim al servizio reale: i dispatch di `currentUgcTrackId`, `currentUgcPoiId` e `inputTyped` restano deliberatamente omessi (feature UGC/search fuori scope del widget). L'omissione viene documentata con un commento nello shim.
- Comportamento su device mobile: `showPhoto` non apre il modal su Android/iOS (`DeviceService.isMobile`), identico alla webapp — nessuna modifica.
- Qualsiasi modifica ai submodule (`wm-core`, `map-core`, `wm-types`).

## Moduli toccati

| File | Repo | Modifica |
|---|---|---|
| `src/app/services/local-url-handler.service.ts` | wm-elements | Dispatch di `currentEcImageGalleryIndex` in `_dispatchFromParams` con check `!= null`; commento sulle omissioni deliberate degli altri dispatch |
| `docs/features/immagine-non-visibile-modal-galleria-wm-layer-map/*` | wm-elements | Documentazione del workflow |
