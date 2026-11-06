> Ticket: oc:8937

# Embed mappe per singola traccia

## Cosa cambia

Il custom element `<wm-layer-map>` accetta un nuovo attributo opzionale `track-id`. Se è presente, al
caricamento il widget apre la traccia indicata come se l'utente l'avesse cliccata sulla mappa: traccia
evidenziata, mappa centrata su di essa, dettaglio aperto (`wm-track-properties`, nel CSS part `panel`).
Da lì in poi il widget funziona come oggi: chiudendo il dettaglio la mappa mostra tutto il layer e si
possono cliccare le altre tracce.

Senza `track-id` il widget si comporta esattamente come oggi.

Su mobile (sotto i 600 px), con o senza `track-id`, il dettaglio di tracce e POI occupa la metà bassa
del widget e la mappa la metà alta, con la traccia aperta inquadrata per intero, come nell'app
(modifica aggiunta dopo il piano, su richiesta del dev).

Esempio di snippet:

```html
<wm-layer-map
  shard="camminiditalia"
  app-id="1"
  layer-id="117"
  track-id="1186"
  style="display:block;width:100%;height:600px"
></wm-layer-map>
```

## Perché

Cammini d'Italia (Davide) vuole inserire nel proprio sito la mappa di una singola tappa, per esempio la
Tappa 01 di un cammino. Allo scrum del 05/11/2026 (11:48) Giuseppe ha deciso di non creare un widget
nuovo: si passa un parametro a `wm-layer-map`, che «serve solo come init» e chiama la stessa funzione del
click. Davide ha confermato la proposta il 05/11 alle 16:22.

Allo scrum del 06/11/2026 si è deciso di fare anche il bottone di copia dello snippet sulla traccia nel
backend, con una select quando la traccia appartiene a più layer. Lo fa Alessandro in un ticket a parte;
questo ticket riguarda solo il widget.

## Requisiti

- [ ] `@Input('track-id') trackId` su `WmLayerMapComponent`. `createCustomElement` lo mappa da solo
      sull'attributo HTML, senza registrazioni altrove.
- [ ] All'avvio, se `track-id` è valorizzato, il widget chiama `updateEcTrack(+trackId)`, la stessa
      funzione usata dal click su una traccia, **una sola volta**.
- [ ] La chiamata avviene dopo il posizionamento iniziale della mappa sul layer (`apply()` di
      `WmLayerMapDirective`): si attende il primo `rendercomplete` della mappa OpenLayers e poi il
      `moveend` successivo, con un limite di 1,5 s se `moveend` non arriva. Una selezione anticipata
      viene annullata dallo zoom iniziale sul layer.
- [ ] Prima di selezionare, il widget annulla la selezione iniziale se c'è già una traccia selezionata
      (parametri correnti di `LocalUrlHandlerService`): vuol dire che il visitatore ha cliccato una
      traccia mentre la mappa finiva di caricarsi, e la sua scelta vince.
- [ ] Un `track-id` vuoto o non numerico (es. `""`, `"abc"`) viene ignorato: si seleziona solo con un
      intero positivo.
- [ ] `track-selected` viene emesso anche per la selezione iniziale, perché si usa la stessa
      `updateEcTrack()` del click; il README lo dice esplicitamente.
- [ ] Il widget non controlla che la traccia appartenga al layer e non emette errori. Con un ID
      inesistente il widget mostra il layer come se `track-id` non ci fosse (decisione dello scrum del
      05/11: «se sbagliano […] loro»).
- [ ] La demo (`npm run start:demo`) ha un campo `track-id`: il widget di anteprima lo riceve e lo
      snippet «Codice da embeddare» mostra la riga `track-id="…"` quando è valorizzato.
- [ ] Lo scenario con `track-id` (layer 117, traccia 1186) sta in una pagina di test a parte,
      `test/wm-layer-map/track-id.html`: in `index.html` le istanze condividono lo store e il `track-id`
      aprirebbe la traccia anche negli altri scenari. `scripts/sync-test-page.js` aggiorna i bundle di
      tutte le pagine di `test/wm-layer-map/`.
- [ ] Sotto i 600 px il dettaglio di tracce e POI occupa la metà bassa e la mappa la metà alta; con una
      traccia aperta il widget rifà il fit sulla traccia alla nuova altezza (modifica a posteriori).
- [ ] README e `CLAUDE.md` del repo citano il nuovo attributo e il nuovo scenario di test.
- [ ] README e pagina di conoscenza dicono che è supportato **un solo `<wm-layer-map>` per pagina**; la
      riga del `CLAUDE.md` che parla di «nessuno stato condiviso tra istanze» viene corretta.
- [ ] Verifiche prima della PR, nella demo e nella pagina di test dopo `npm run build:test:wm-layer-map`:
  - layer 117 + traccia 1186 da desktop: 5 caricamenti su 5 con traccia evidenziata, mappa centrata e
    dettaglio aperto, svuotando la cache almeno una volta;
  - chiusura del dettaglio → la mappa mostra tutto il layer; click su un'altra traccia → comportamento attuale;
  - stesso scenario sotto i 600 px di larghezza: dettaglio nella metà bassa, traccia intera nella metà alta;
  - i tre scenari esistenti senza `track-id` invariati;
  - `track-id` inesistente: il layer si vede senza blocchi.

## Rischi

- **Tempi di inizializzazione della mappa:** la selezione deve partire dopo lo zoom iniziale sul layer.
  Mitigato attendendo `rendercomplete` → `moveend` (prova locale del 05/11: 3 caricamenti su 3 corretti
  da desktop) e con 5 caricamenti di verifica, anche a cache vuota.
- **Accesso alla mappa OpenLayers:** `WmLayerMapDirective` tiene `_mapCmp` privato. Serve un modo per
  leggere `map` senza rompere l'incapsulamento: un getter pubblico sulla direttiva, che è del repo.
- **Più widget nella stessa pagina:** `bootstrap-widget.ts` crea una sola applicazione Angular per
  pagina, con un solo store: la traccia selezionata è unica per tutti i `<wm-layer-map>`. Con un
  `track-id` per widget, l'ultimo vince e tutti aprono la stessa traccia. Il limite esiste già con il
  click; non si risolve qui (servirebbe rifare il bootstrap): si documenta «un widget per pagina» e lo
  si dice al cliente.
- **Click del visitatore prima della selezione iniziale:** su rete lenta `rendercomplete` arriva tardi
  e la mappa è già cliccabile. Mitigato annullando la selezione iniziale se c'è già una traccia
  selezionata.
- **`track-selected` all'avvio:** chi ascolta l'evento lo riceve anche senza click. Accettato e
  documentato, per non creare un percorso diverso da quello del click.
- **Mobile (modifica a posteriori, richiesta del dev):** sotto i 600 px il dettaglio (traccia o POI)
  occupa la metà bassa e la mappa la metà alta, come nell'app; al cambio di dimensione della mappa con
  una traccia aperta il widget rifà il fit sulla traccia. Cambia il comportamento su mobile per tutti i
  widget già pubblicati, anche al click.

## Out of scope

- Bottone «Copia codice web component» sulla traccia nel backend (wm-package), con select del layer
  quando la traccia appartiene a più layer: lo fa Alessandro in un ticket a parte.
- Passare il layer da usare per la copia come parametro, per evitare la select: follow-up deciso allo
  scrum del 06/11.
- Trascinamento del dettaglio su più altezze come in `webmapp-app` (`map-details`): su mobile il dettaglio
  resta fisso a metà.
- Supportare più `<wm-layer-map>` indipendenti nella stessa pagina.

## Moduli toccati

Tutti nel repo `wm-elements`, nessuna modifica al codice dei submodule (i puntatori di `wm-core` e
`wm-types` sono aggiornati ai rispettivi `main`, decisione del dev durante la review):

- `src/app/wm-layer-map/wm-layer-map.component.scss` — layout mobile a metà (dettaglio in basso, mappa in alto)
- `src/app/wm-layer-map/wm-layer-map.component.ts` — nuovo input, selezione iniziale della traccia, refit su
  mobile e `currentLayer$` che passa il layer alla direttiva solo quando cambia l'`id`
- `src/app/wm-layer-map/directives/wm-layer-map.directive.ts` — getter pubblico per la mappa OpenLayers
- `src/app/demo/demo.component.ts` e `src/app/demo/demo.component.html` — campo `track-id` e snippet
- `test/wm-layer-map/track-id.html` (nuovo) — scenario con `track-id`
- `scripts/sync-test-page.js` — aggiorna tutte le pagine di test del widget
- `README.md`, `CLAUDE.md` — documentazione dell'attributo, dello scenario e del limite «un widget per
  pagina»
