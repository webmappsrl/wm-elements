# Embed di una singola traccia in wm-layer-map (`track-id`)

## Come funziona oggi

Il comportamento visibile dell'attributo è descritto nel README (attributi opzionali). Qui solo i vincoli.

- La selezione iniziale chiama `updateEcTrack(id)`, la stessa funzione del click, e parte dopo il
  posizionamento iniziale sul layer: primo `rendercomplete` della mappa OpenLayers, poi il `moveend`
  successivo, con un limite di 1,5 s (`_selectInitialTrackAfterRender` in `wm-layer-map.component.ts`).
- Si seleziona solo con un intero positivo; se il visitatore ha già cliccato una traccia, la selezione
  iniziale non parte. Il widget non controlla che la traccia appartenga al layer.
- `currentLayer$` passa il layer alla direttiva solo quando cambia l'`id` (`distinctUntilChanged`): alla
  selezione di una traccia lo store riemette lo stesso layer come oggetto nuovo, e `WmMapLayerDirective`
  di map-core, ricevendolo di nuovo con i `queryParams` sempre vuoti di `fakeActivatedRoute`, rifà il fit
  sul bbox (`layer.directive.ts:115-127`) e annulla lo zoom sulla traccia. Togliendo il filtro la build
  resta verde, ma nella demo la selezione della traccia viene annullata; nel widget compilato non è
  stato riprodotto (un caricamento su 13 non centrato, causa non verificata).
- Lo scenario di verifica sta in `test/wm-layer-map/track-id.html`, separato da `index.html` per il motivo
  scritto nel `CLAUDE.md` (store condiviso fra le istanze di una pagina).

## Perché così

- **Parametro su `wm-layer-map`, non un widget nuovo** (oc:8937): deciso allo scrum del 05/11/2026; il
  dettaglio della traccia c'era già, serviva solo selezionarla all'avvio.
- **Stessa funzione del click** (oc:8937): un solo percorso di selezione.
- **Nessun controllo di appartenenza al layer** (oc:8937): lo snippet con il `layer-id` giusto lo genera
  il backend (bottone di copia sulla traccia, ticket di Alessandro); per gli errori manuali, decisione dello
  scrum del 05/11.

## Come ci siamo arrivati

- **Selezione immediata o al primo render** (oc:8937, scartata): veniva annullata dal fit iniziale.
- **Widget nuovo `wm-track-map`** (oc:8937, scartato): Giuseppe allo scrum del 05/11, troppo lavoro per una
  richiesta non pagata.
