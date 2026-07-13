> Ticket: oc:8252

# wm-layer-map Angular — webcomponent DRY per layer map con POI

## Cosa cambia

Nasce il repo `wm-elements`, workspace Angular che ospiterà i webcomponent embeddabili di Webmapp costruiti con Angular Elements, riusando i componenti condivisi già esistenti in `wm-core`/`map-core` invece di reimplementarli in vanilla JS.

Il primo task è la reimplementazione di `<wm-layer-map>` (attualmente vanilla JS/OpenLayers, repo `webmappsrl/wm-layer-map`) come Angular Element, con:

- stessa API pubblica del widget attuale (attributi, eventi, CSS custom properties, `::part()`)
- stessa feature-parity: mappa OL con fit bbox iniziale, layer raster+PBF, tracce cliccabili, pannello dettaglio (dati tecnici, galleria, descrizione, grafico altimetrico), badge app/store, CTA
- **novità**: visualizzazione dei POI del layer con marker + pannello dettaglio, stesso comportamento della webapp (riuso diretto delle directive/componenti già esistenti in `map-core`/`wm-core`, non reimplementati)

## Perché

Il widget attuale duplica manualmente logica già presente e mantenuta nella webapp (rendering tracce, pannello dettaglio, grafico altimetrico in Chart.js scritto da zero). Ogni nuova feature della webapp richiede una riscrittura separata nel widget, con rischio di disallineamento. Riusando i componenti di `wm-core`/`map-core` si elimina questa duplicazione: le feature nuove della webapp diventano automaticamente disponibili (o quasi) anche nel widget.

## Requisiti

- [ ] Nuovo repo `wm-elements` (Angular, workspace singolo progetto), con `map-core`, `wm-core`, `wm-types` montati come submodule Git, stessa convenzione di path/alias già in uso in `wm-webapp` (`@map-core/*`, `@wm-core/*`, `@wm-types/*` → import diretti da `src/*`, nessuna modifica ai submodule)
- [ ] Componente `<wm-layer-map>` generato con Angular Elements (`createCustomElement`), un'istanza indipendente per elemento — nessuno stato condiviso tra istanze, non previsto multi-instance sulla stessa pagina
- [ ] Store NgRx isolato per istanza, montato integralmente come fornito da `wm-core` (tutti i reducer/effects del pacchetto, non un sottoinsieme di slice scelto a mano) — evita selector orfani nei componenti riusati; nessuna route/router Angular attivo, nessuna condivisione tra istanze
- [ ] Ispezione preliminare (primo step del piano, prima di scrivere codice) dei componenti concretamente riusati (pannello dettaglio traccia/POI, slope chart) per verificare: dipendenza da `ActivatedRoute`/query param, uso di tag Ionic runtime (es. `ion-icon`) da caricare nello shadow root oltre alle CSS custom properties
- [ ] Nessuna manipolazione dell'URL della pagina host: selezione POI/traccia gestita come stato interno al componente
- [ ] API pubblica invariata rispetto al widget attuale:
  - Attributi obbligatori: `shard`, `app-id`, `layer-id`
  - Attributi opzionali: `cta-label`, `cta-url`, `app-icon-url`, `ios-store-url`, `android-store-url`, `hide-cta`, `lang`
  - Eventi custom: `ready`, `track-selected`, `error`
  - Theming: stesse CSS custom properties (`--wm-color-primary`, `--wm-color-dark`, `--wm-color-light`, `--wm-color-light-rgb`, `--wm-font-sm`, `--wm-font-family`, `--wm-panel-width`, `--wm-control-size`, `--wm-surface-radius`, `--wm-surface-shadow`) e stessi CSS Parts (`map-wrap`, `top-bar`, `app-link`, `store-links`, `layer-badge`, `bottom-left`, `scale-line`, `map`, `attribution`, `panel`, `panel-close`, `panel-title`)
- [ ] Shadow DOM per l'isolamento CSS (coerente con l'attuale API di theming via `::part()`), con porting mirato delle sole variabili Ionic (`var(--ion-*)`) effettivamente usate dai componenti riusati di `wm-core`/`map-core`, iniettate come default nello shadow root e sovrascrivibili dall'esterno
- [ ] Riuso diretto (non riscrittura) dei componenti/direttive esistenti per: layer raster+PBF, tracce, pannello dettaglio traccia, grafico altimetrico (slope chart), marker+dettaglio POI
- [ ] Pannello dettaglio traccia: dati tecnici (partenza, arrivo, distanza, dislivelli), galleria immagini, descrizione, grafico altimetrico — stessi campi del widget attuale
- [ ] POI del layer: marker sulla mappa, click apre pannello dettaglio — stesso comportamento della webapp (riuso dei componenti esistenti, non un pannello ridisegnato da zero)
- [ ] Badge app/CTA e badge store (App Store/Google Play), layout desktop/mobile coerente con l'attuale (badge app+layer in alto, badge store in basso sopra scale bar)
- [ ] Pipeline di distribuzione: bundle buildato pubblicato su un branch stabile (es. `dist`), servito via jsDelivr con URL fissa — l'URL embeddata dal cliente non cambia mai tra un rilascio e l'altro; ogni pubblicazione tagga anche un Git tag puntuale (es. `dist-YYYYMMDD-HHmm`) per poter fare rollback ripuntando il branch `dist` a un tag precedente invece di un force-push distruttivo
- [ ] Repo `wm-elements` pubblico su GitHub (richiesto da jsDelivr `/gh/`)
- [ ] Verifica manuale tramite pagina di test locale (`test/index.html` o equivalente), con scenari fissi: layer solo-tracce, layer tracce+POI, `hide-cta` attivo, lingua non italiana

## Rischi

- **Dipendenza da Ionic nello Shadow DOM**: i componenti riusati di `wm-core` (38 file SCSS con classi `ion-*`, 12 con `var(--ion-*)`) sono pensati per girare dentro l'ambiente globale della webapp Ionic. Mitigazione: portare nello shadow root solo le custom properties Ionic effettivamente usate da questi componenti, come default locali sovrascrivibili.
- **Nessun test automatico dedicato in `wm-elements`**: la logica di dominio è già coperta dai test dei submodule; il nuovo repo fa principalmente wiring/composizione UI, per cui si accetta la sola verifica manuale come criterio di successo per questo rilascio.
- **Scadenza stretta (rilascio in giornata)**: mitigata dal fatto che il lavoro è composizione di componenti già esistenti e testati in `wm-core`/`map-core`, non progettazione di nuova UX da zero.
- **Pipeline di distribuzione non ancora esistente**: va creata da zero (branch `dist` + build); finché non è automatizzata via CI, il bundle va pubblicato manualmente sul branch stabile ad ogni aggiornamento — rischio di dimenticanza, da tenere presente nei prossimi cicli.

## Out of scope

- Migrazione o modifica del repo `webmappsrl/wm-layer-map` esistente (resta invariato, sarà deprecato in un secondo momento)
- Multi-istanza dello stesso webcomponent su una singola pagina
- Sincronizzazione con l'URL della pagina host (deep-link a POI/traccia specifici)
- Automazione CI della pipeline di distribuzione (branch `dist` aggiornato via GitHub Action) — per ora pubblicazione manuale del bundle
- Test automatici Karma/Jasmine dedicati a `wm-elements`
- Nuovi widget oltre a `wm-layer-map` (il repo è predisposto per ospitarne altri in futuro, ma non fanno parte di questo ticket)
- Gestione esplicita di errori/fallback visivo (layer non trovato, rete irraggiungibile, CSP del sito host) — l'evento `error` viene emesso come da API attuale, ma nessun placeholder/UX dedicata è richiesta in questo ciclo

## Moduli toccati

- **Nuovo repo `wm-elements`** (da creare): workspace Angular, submodule `map-core`/`wm-core`/`wm-types`, componente `wm-layer-map` (Angular Element), configurazione build/bundle, pagina di test manuale
- **`webmappsrl/wm-layer-map`**: nessuna modifica (resta come riferimento/fallback fino a deprecazione futura)
- **`map-core`/`wm-core`/`wm-types`**: nessuna modifica, riuso as-is tramite gli stessi path alias già in uso in `wm-webapp`
