> Ticket: oc:8240

# Notes — EMBED zoom minimo e POI mancanti

## Deviazioni dal piano

- **Task 2 riprogettato durante l'esecuzione**: il piano approvato (Fase: write-plan) prevedeva un `WidgetConfService extends ConfService`, registrato via override DI in `bootstrap-widget.ts` (stesso pattern di `UrlHandlerService`/`EnvironmentService`). Durante la verifica manuale su `npm run start:demo`, si è scoperto che la demo usa un bootstrap Angular separato (`bootstrap-demo.ts`, entry point `src/main.demo.ts`) che **non** registra quell'override — la demo avrebbe mostrato il comportamento pre-fix mentre il widget reale (bootstrap-widget.ts) avrebbe avuto il fix, un'incoerenza non prevista in fase di pianificazione.
  Soluzione adottata: si è risalita la catena con cui `map-core/pois.directive.ts` riceve `wmMapConf` (via `@Input()` ereditato da `WmMapBaseDirective`, valorizzato dallo stesso binding di template `[wmMapConf]="confMap$|async"` che alimenta anche `<wm-map>`) e si è trasformato `confMap$` direttamente in `wm-layer-map.component.ts` con un operatore RxJS `map()`. Questo rende il fix locale al componente, indipendente da quale bootstrap lo monta, e più semplice (nessun nuovo file, nessuna registrazione DI).
  `overview.md` e `plan.md` sono stati aggiornati per riflettere questo approccio prima di procedere con l'implementazione.

## Bug trovati

- Nessuno oltre a quello già documentato in overview.md (il bug `|| 15` su valore falsy in `map-core/pois.directive.ts`, noto da prima dell'implementazione e mitigato scegliendo `poiMinZoom = 5` invece di `0`).

## Decisioni

- Vedi "Deviazioni dal piano" sopra: cambio di approccio Task 2, da override DI globale (`ConfService`) a trasformazione locale dell'observable `confMap$` nel componente del widget.
- **Requisito aggiunto durante l'esecuzione (Task 3)**: dopo la verifica visiva dei fix zoom/POI, il developer ha segnalato che il bbox del layer, usato "grezzo" sia per il fit che per il vincolo di pan, lascia i punti di partenza/arrivo appiccicati al bordo del viewport (poco cliccabili). Non era nel commento originale del cliente né nell'overview iniziale — aggiunto come terzo requisito nello stesso ambito "usabilità embed", con margine del 10% per lato scelto dal developer su proposta di 3 opzioni (10%, 5%, valore custom).

- **Fix tecnico minore durante Task 3**: la prima implementazione di `bufferExtent` tipizzava extent come tupla `[number, number, number, number]`, ma `extentFromLonLat` (map-core) ritorna il tipo `Extent` di OpenLayers (`number[]`, non tupla) — build fallita con `TS2345`. Corretto tipizzando `bufferExtent` con `Extent` importato da `ol/extent`. Approfittato per sistemare anche `view.getZoom()` (tipo `number | undefined`) con fallback a `confMinZoom` se `undefined`.

## Follow-up

- Nessuno identificato al momento della scrittura di queste note (verifica manuale finale ancora da completare).
