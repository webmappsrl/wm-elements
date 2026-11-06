> Ticket: oc:8937

# Notes — Embed mappe per singola traccia

## Divergenze dal piano, task per task

### Task 3 verifiche in demo

Nella demo (`npm run start:demo`) la mappa **non restava centrata** sulla traccia, e la traccia restava
disegnata fuori schermo: circa 0,2 s dopo il fit sulla traccia arrivava un nuovo fit sul bbox del layer.
Succedeva **anche con il click manuale**, senza `track-id`. Causa, dai log dei metodi delle direttive:
alla selezione di una traccia lo store riemette il layer (`ecLayer`) come oggetto nuovo con contenuto
identico; il binding `[wmMapLayerLayer]="currentLayer$|async"` lo ripassa a `WmMapLayerDirective` di
map-core, che con i `queryParams` sempre vuoti di `fakeActivatedRoute` rifà il fit sul bbox
(`layer.directive.ts:115-127`). Nel custom element compilato la riemissione non annullava lo zoom.

Correzione chiesta dal dev durante la review: `currentLayer$` in `wm-layer-map.component.ts` passa il
layer solo quando cambia l'`id` (`distinctUntilChanged`). Verificato prima che le due emissioni hanno
contenuto identico (nessuna proprietà diversa), quindi non si perdono dati. Dopo la correzione: demo con
`track-id` centrata, chiusura → layer, click sulla Tappa 9 → resta sulla traccia; build: 3 caricamenti su
3 centrati (zoom 14.2) e click sulla Tappa 9 che resta sulla traccia.

### Task 4 verifiche sulla pagina di test

`test/wm-layer-map/index.html` (e quindi anche la nuova `track-id.html`) non carica il widget dopo
`npm run build:test:wm-layer-map`: `ChunkLoadError: Loading chunk 7650 failed`, perché i chunk lazy vengono
cercati in `test/wm-layer-map/` invece che in `dist/wm-layer-map/`. È un problema già presente, non
introdotto da questo ticket.

Decisione: verifiche fatte su copie temporanee delle pagine dentro `dist/wm-layer-map/` (senza
`<base href="/">`), servite con `Cache-Control: no-store`. Le copie sono state cancellate.

## Esito delle verifiche (custom element compilato, layer 117, traccia 1186)

- Desktop: 12 caricamenti su 13 con traccia centrata (zoom 14.2) e dettaglio aperto, di cui 8 senza
  cache. Un caricamento (il primo dopo la build, senza log) è rimasto sulla vista del layer con il
  dettaglio aperto; non si è più riprodotto, né con la cache disattivata né con il log dei tempi.
- Chiusura del dettaglio: la mappa torna al layer (zoom 10.1); il click su un'altra traccia funziona.
- 400–500 px: il dettaglio copre il widget, chiudendolo si vede il layer. *Superato dal layout mobile a
  metà (vedi «Decisioni»).*
- `track-id` `99999999`, `abc`, `0`, `-3`, vuoto: layer a zoom 10.1, nessun dettaglio aperto, widget
  usabile.
- Click anticipato: simulato chiamando `updateEcTrack(1199)` appena la mappa esiste (non con «Slow 4G»):
  resta aperta la traccia 1199 e la selezione iniziale non parte.

## Decisioni

- Modifica a posteriori (dopo il piano, richiesta del dev): `currentLayer$` con
  `distinctUntilChanged` sull'`id` del layer, per evitare il refit sul bbox alla selezione di una traccia
  (vedi «Task 3 verifiche in demo»).
- Aggiornamento dei submodule deciso dal dev durante la review: `src/app/shared/wm-core` da `02554c3` a
  `f91ee91` e `src/app/shared/wm-types` da `1214283` a `cc301d2`, cioè i rispettivi `origin/main`
  (`map-core` invariato su `15c4f21`). I commit che risultano «persi» nel diff dei submodule (oc:8164,
  oc:8177, oc:7980, `logo_image`) stavano sul branch `RDO_ass_cammini_italia_2026_2` e sono arrivati in
  `main` con uno squash: `showTrackRemainingDistance` c'è in wm-types e wm-core, `logo_image` c'è nel tipo
  di wm-core usato dal badge del widget (non in wm-types). Verifiche rifatte dopo lo spostamento: build
  pulita, demo con `track-id`, `track-id.html` (zoom 14.2), i tre scenari di `index.html` (base, `hide-cta`,
  `lang="en"`), galleria in produzione (immagini S3 con risposta 200). Va in un commit separato
  `chore(oc:8937): update wm-core and wm-types to main`.
- Modifica a posteriori (richiesta del dev, dopo i commit e la review): layout mobile come nell'app. Sotto
  i 600 px (`@media (max-width: 600px)`, stessa soglia di `MOBILE_PANEL_MEDIA_QUERY`) il dettaglio di tracce
  e POI parte a metà altezza e la mappa si riduce alla metà alta (`.panel ~ wm-map`); un POI «compatto»
  resta alto quanto il contenuto e non riduce la mappa. Al `change:size` della mappa, con una traccia
  aperta, `_refitTrackOnMobileResize` rifà il fit sull'estensione della traccia (padding in alto 80 px per
  i badge). Provata prima la versione solo CSS: la traccia restava centrata ma troppo zoomata, perché lo
  zoom di map-core è calcolato sull'altezza intera. Il trascinamento su più altezze di `webmapp-app` non è
  stato fatto. Verifiche sulla build: `track-id.html` a 549 px 3 caricamenti su 3 con la Tappa 01 intera
  nella metà alta (zoom 12.6), dettaglio POI del layer 63 nella metà bassa; nella demo click sulla
  Tappa 11 inquadrata intera, chiusura → mappa a tutta altezza; a 1512 px nessun cambiamento (pannello
  laterale, zoom 14.2) e i tre scenari di `index.html` invariati. Non provati: telefono vero, rotazione,
  POI compatto.
- Correzione dalla terza review interna: il listener `change:size` per il refit su mobile veniva collegato
  da un'attesa della mappa partita in `ngAfterViewInit` (al massimo 2 s); map-core crea la mappa solo dopo
  la config più `delay(250)` (`map.component.ts:151-160`), quindi su rete lenta poteva non collegarsi mai.
  Ora `_refitTrackOnMobileResize` parte dopo `apply()`, a config già caricata, e il suo timer è cancellato
  in `ngOnDestroy`. Verifica: config ritardata di 3 s via script nella pagina di prova (non con «Slow 3G»
  dei DevTools, non attivabile dagli strumenti usati), 500 px → Tappa 01 intera nella metà alta (zoom
  12.6); rete normale 500 px zoom 12.6; 1512 px invariato (zoom 14.2, pannello laterale); `index.html`
  invariato. POI vicino al bordo basso (Necropoli di Caiolo, layer 63, 500 px): la selezione del POI
  centra la mappa sul POI, che resta visibile nella metà alta. Cleanup: media query unite,
  `prefers-reduced-motion` anche per `wm-layer-map-poi-panel`, `currentTrack` tipizzato
  (`WmFeature<LineString>`), `MOBILE_PANEL_MEDIA_QUERY` ricavata da `maxWidth`.
- Cleanup dalla review interna: il timer della selezione iniziale viene cancellato quando parte la
  selezione e in `ngOnDestroy`; le costanti di attesa della mappa sono esportate da
  `wm-layer-map.directive.ts` (`MAP_READY_POLL_*`) e riusate nel componente invece di essere copiate.
- Stima approvata dal dev: 3 h (wm-estimate: misurato 0,58 h + stimato 2,1 h).
- La stima di `wm-estimate` è stata fatta dopo il piano, non prima: l'agente non stima senza `plan.md`.

## Pubblicazione (06/11/2026)

- PR #1 mergiata su `main` (squash `6f2792a`, Alessandro). Pubblicato con `publish-dist.sh wm-layer-map`:
  tag `dist-wm-layer-map-20261106-1258`, commit `fbcb51c` su `dist`.
- **Incidente:** dopo la pubblicazione il widget era rotto per tutti gli embed (`ChunkLoadError: Loading chunk
  7650 failed`, richiesto `7650.undefined.js`). Causa: `publish-dist.sh` sceglieva i nomi per `entries.json`
  con `ls main.*.js | head -1` nella copia pubblicata, che contiene anche i bundle della versione precedente;
  ha preso il `main` vecchio (`main.66639366…`) insieme al `runtime` nuovo (`runtime.331fc5ee…`).
  Correzione in avanti su `dist` (commit `a65d751`, solo `entries.json` → `main.8b647f52…`), senza
  force-push; il widget è tornato a funzionare in circa 3 minuti (cache di raw.githubusercontent.com).
  Verifica con lo snippet vero (jsDelivr): desktop Tappa 01 centrata con galleria, snippet senza
  `track-id` invariato, mobile 500 px con dettaglio a metà.
- Correzione dello script nel branch `fix/publish-dist-entries-manifest`: i nomi si prendono dalla build
  locale `dist/<widget>/` e lo script si ferma se un tipo di bundle ha più di un file.

## Follow-up

- Mobile: trascinamento del dettaglio su più altezze come in `webmapp-app`; prova su telefono vero e in
  rotazione.

- Pagine di test rotte con la build (`ChunkLoadError` sui chunk lazy): `npm run build:test:*` non imposta un
  `deploy-url` coerente con `test/<widget>/`.
- Un caricamento su 13 (prima della correzione su `currentLayer$`) non centrato e non riprodotto. Suppongo,
  senza averlo verificato, che fosse la stessa riemissione del layer vista nella demo: se Davide lo
  segnala, partire da lì.
- Più `<wm-layer-map>` indipendenti nella stessa pagina (store condiviso).
- Passare il layer come parametro al bottone di copia nel backend (scrum 06/11).
- Demo, shard `camminiditaliadev`: le immagini della galleria sono rotte perché i file su
  `camminiditalia.dev.maphub.it/wmfe/camminiditaliadev/1/media/…` rispondono 404 (es. `2790/volterra.jpg`);
  in produzione gli stessi file su `wmfe.s3…/camminiditalia/1/media/…` rispondono 200 e il widget li mostra.
  È un problema di dati del server dev, non del codice.
- Demo: se si preme «Applica e ricarica anteprima» prima che la mappa del widget iniziale esista,
  `WmMapComponent.ngOnDestroy` di map-core chiama `this.map.dispose()` con `map` indefinita e il widget
  non viene rimontato (pagina vuota). Già presente; si aggira aspettando il caricamento.
