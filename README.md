# wm-elements

Webcomponent embeddabili Webmapp costruiti con Angular Elements, che riusano i componenti condivisi di `wm-core`/`map-core` invece di reimplementarli in vanilla JS. Un solo repo pensato per ospitare **più widget nel tempo** — ognuno con la propria build, il proprio bundle e la propria URL di distribuzione indipendenti dagli altri. Il primo widget è `<wm-layer-map>`.

Dettagli architetturali e convenzioni del repo: vedi [`CLAUDE.md`](./CLAUDE.md).

## Requisiti

- **Node.js ≥ 20.19** (richiesto da Angular CLI 20). Se hai [nvm](https://github.com/nvm-sh/nvm) installato, il repo ha un `.nvmrc`:
  ```bash
  nvm use
  ```
  Se la versione non è installata: `nvm install`.
- Git con supporto ai submodule.

## Setup iniziale

```bash
git clone --recurse-submodules <url-repo> wm-elements
cd wm-elements
nvm use          # o: nvm install se non hai ancora la versione richiesta
npm install
```

Se hai già clonato il repo senza `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

I submodule (`src/app/shared/map-core`, `src/app/shared/wm-core`, `src/app/shared/wm-types`) sono pinnati a commit specifici (non alla punta dei branch) — `git submodule update --init` li porta automaticamente ai commit corretti, nessun checkout manuale necessario.

## Sviluppo quotidiano

```bash
npm run start:demo
```

Avvia `ng serve --configuration=demo` su `http://localhost:4200` — monta i componenti del widget come normali componenti Angular (non come custom element), con hot reload istantaneo e un form per cambiare a runtime gli attributi (`shard`, `app-id`, `layer-id`, `lang`, `hide-cta`). Usa questa modalità per il lavoro di tutti i giorni.

**Non usare le build di produzione per iterare**: il bundle custom-element non ha hot reload (richiede rebuild manuale ad ogni modifica).

## Architettura multi-widget: build indipendenti per widget

Ogni widget ha:
- il proprio entry point (`src/main.ts` per `wm-layer-map`; un futuro widget avrebbe un proprio `src/main-<widget>.ts`)
- la propria **build configuration** in `angular.json` (`architect.build.configurations.<widget-name>`, es. `"wm-layer-map"`), che imposta `main`/`index`/`outputPath` dedicati
- il proprio output in `dist/<widget-name>/`
- la propria pagina di verifica manuale in `test/<widget-name>/index.html`

Costruire un widget **non deve mai toccare o ricostruire gli altri**. Comando per `wm-layer-map`:

```bash
npm run build:wm-layer-map
```

Equivale a `ng build --configuration=production,wm-layer-map` e genera il bundle in `dist/wm-layer-map/` — questo è ciò che verrà pubblicato sul branch `dist` (sottocartella `wm-layer-map/`) e servito via jsDelivr (vedi sotto). Va verificato solo prima di pubblicare o quando si tocca qualcosa di specifico del custom element (Shadow DOM, mapping attributi, eventi) — non per l'iterazione quotidiana.

**Aggiungere un nuovo widget in futuro**: creare `src/main-<widget>.ts` (bootstrap standalone, stesso pattern di `src/main.ts`) e `src/index-<widget>.html`, poi in `angular.json` aggiungere una configuration `<widget>` con `main`/`index`/`outputPath: "dist/<widget>"`, e in `package.json` gli script `build:<widget>` / `build:test:<widget>` sul modello di quelli di `wm-layer-map`.

### Verificare manualmente il bundle appena buildato

Senza dover aggiornare a mano i nomi (hash) dei file generati ad ogni build:

```bash
npm run build:test:wm-layer-map
npx http-server .
```

e apri `http://localhost:8080/test/wm-layer-map/index.html`. `build:test:wm-layer-map` esegue la build e poi rigenera i tag `<link>/<script>` di `test/wm-layer-map/index.html` a partire dal vero `dist/wm-layer-map/index.html` (`scripts/sync-test-page.js wm-layer-map`) — necessario perché Angular genera più bundle separati (`runtime`/`polyfills`/`scripts`/`main`/`styles.css`) con un hash diverso ad ogni build; caricarne solo uno o con l'hash sbagliato fa fallire silenziosamente la registrazione del custom element (nessun errore in console).

**Limite noto di questa verifica locale**: senza `--deploy-url` (usata solo in fase di pubblicazione, vedi sotto), eventuali chunk JS caricati lazy internamente da `wm-core`/`map-core` vengono richiesti con un path relativo alla pagina di test invece che alla cartella del bundle — un 404 innocuo in locale, che invece è risolto correttamente nella build pubblicata (che imposta `publicPath` in modo esplicito). La registrazione del custom element e il comportamento base del widget restano comunque verificabili così.

## Consegna del webcomponent al cliente

Il bundle non va consegnato/embeddato direttamente da `dist/<widget>/` (percorso locale, con hash che cambiano ad ogni build) — va pubblicato sul branch `dist` del repo, in una sottocartella dedicata al widget, e servito via jsDelivr con un **URL fissa che non cambia mai per il cliente** anche dopo nuove pubblicazioni.

### Pubblicare una nuova versione

```bash
./scripts/publish-dist.sh wm-layer-map
```

Lo script:
1. Verifica che non ci siano modifiche non committate e che la configuration richiesta esista in `angular.json`.
2. Esegue `ng build --configuration=production,<widget> --deploy-url=<url-jsdelivr-finale>` — il flag `--deploy-url` è necessario perché con `<script type="module">` il browser non espone `document.currentScript`, quindi Angular/Webpack non può dedurre da solo dove si trova il bundle: senza impostarlo esplicitamente, eventuali chunk caricati lazy verrebbero richiesti relativi alla pagina del cliente (che li ospita) invece che al CDN, con un 404 sul sito di ogni cliente che embedda il widget.
3. Rinomina i bundle di entry (`runtime`/`polyfills`/`scripts`/`main`/`styles`) a nomi fissi (senza hash) **solo nella copia pubblicata** — l'output locale di `dist/<widget>/` non viene toccato, resta con hash per i test ripetuti in locale.
4. Copia `scripts/widget-loader.template.js` come `<widget>.js` nella copia pubblicata — è l'unico file che il cliente referenzia (vedi sotto): al caricamento, carica in sequenza gli altri bundle rinominati, così l'integrazione lato cliente resta a un solo `<script>`, come nel vecchio widget vanilla JS (`webmappsrl/wm-layer-map`), pur essendo Angular internamente diviso in più bundle.
5. Pubblica il branch `dist` (creato al primo utilizzo se non esiste) via worktree temporaneo, aggiornando **solo la sottocartella del widget pubblicato** — gli altri widget già pubblicati su `dist` restano intatti. Mai un force-push distruttivo.
6. Crea un tag Git `dist-<widget>-YYYYMMDD-HHmm` per poter fare rollback (ripuntare `dist` a un tag precedente) senza perdere lo storico delle pubblicazioni.

**Nota per il primo utilizzo**: il repo remoto (`origin`) non ha ancora nessun branch pushato — la prima esecuzione dello script crea sia `dist` sia, implicitamente, il primo push in assoluto sul repo GitHub pubblico. Verifica di avere accesso in push prima di eseguirlo.

### Snippet da consegnare al cliente (`wm-layer-map`)

Un solo `<script>`, come nel widget precedente:

```html
<wm-layer-map
  shard="<shard-cliente>"
  app-id="<app-id>"
  layer-id="<layer-id>"
  style="display:block;width:100%;height:600px"
></wm-layer-map>

<script type="module" src="https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/wm-layer-map/wm-layer-map.js"></script>
```

Questo file (`scripts/widget-loader.template.js` nel repo, pubblicato come `wm-layer-map.js`) non è il bundle Angular vero e proprio — è un piccolo loader hand-written che, sfruttando `import.meta.url` per trovare i propri file "fratelli", carica in sequenza `styles.css`, `runtime.js`, `polyfills.js`, `scripts.js` (graphhopper, caricato come script classico, non modulo — vedi commento nel file) e infine `main.js`, che bootstrappa il vero custom element. Il cliente non deve mai referenziare questi file direttamente né conoscerne l'esistenza.

Attributi opzionali (`cta-label`, `cta-url`, `app-icon-url`, `ios-store-url`, `android-store-url`, `hide-cta`, `lang`), eventi (`ready`, `track-selected`, `error`) e contratto di theming (CSS custom properties, CSS Parts): vedi `CLAUDE.md`, sezione "Global Constraints" del piano in `docs/features/8252-wm-layer-map-angular/plan.md`.

Questo URL **non cambia mai**, anche dopo nuove pubblicazioni di `wm-layer-map` o di futuri altri widget — jsDelivr può impiegare qualche minuto a propagare l'aggiornamento dopo ogni `publish-dist.sh` (cache CDN sui branch, non sui tag).

### Rollback

```bash
git push origin <tag-precedente>:dist --force
```

Ripunta il branch `dist` a un tag di una pubblicazione precedente — mai un `git reset --hard` o un force-push non tracciato: il tag garantisce di poter tornare a uno stato noto in qualunque momento. Attenzione: questo ripunta l'intero branch `dist` (tutti i widget) allo stato registrato in quel tag — se serve un rollback selettivo di un solo widget senza toccare gli altri già aggiornati nel frattempo, va gestito manualmente ripristinando solo la sottocartella interessata da quel tag.

## Convenzioni di test

Nessuna suite automatica dedicata (Karma/Jasmine) in questo repo — la logica di dominio è già coperta dai test dei submodule (`wm-core`/`map-core`). Verifica solo manuale tramite `test/<widget>/index.html`, con scenari fissi: layer solo-tracce, layer tracce+POI, `hide-cta` attivo, lingua non italiana. Dettagli in `CLAUDE.md`.

## Problemi comuni

- **`The Angular CLI requires a minimum Node.js version of v20.19`**: la tua shell sta usando una versione di Node più vecchia (es. Node 18). Esegui `nvm use` nella root del repo.
- **Errori di compilazione su moduli mancanti dopo `npm install`**: verifica che i submodule siano stati inizializzati (`git submodule status` non deve mostrare `-` davanti agli hash) — vedi Setup iniziale.
- **Il custom element non si registra (nessun errore in console) quando apro `test/<widget>/index.html` a mano**: verifica di aver rigenerato i tag con `npm run build:test:<widget>` dopo l'ultima build — un tag mancante o con hash disallineato non genera errori visibili, semplicemente il webpack runtime non esegue mai il modulo principale.
