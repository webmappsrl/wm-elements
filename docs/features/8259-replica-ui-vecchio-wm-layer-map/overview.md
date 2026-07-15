> Ticket: oc:8259

# Replica elementi UI top-bar/badge e apertura pannello dettaglio del vecchio wm-layer-map

## Cosa cambia

Il widget Angular `<wm-layer-map>` viene esteso con gli elementi UI del vecchio widget vanilla JS (`webmappsrl/wm-layer-map`) che oggi mancano:

- **CTA "apri l'app"** in top-bar sinistra: icona + label + sottotitolo, link cliccabile verso la webapp
- **Layer badge** in top-bar destra: nome/etichetta del layer corrente
- **Badge store** (App Store / Google Play) in basso a sinistra, mostrato in base alla piattaforma rilevata (`navigator.userAgent`)
- Nuovo attributo `hide-cta` per nascondere CTA e badge store
- Nuovo attributo `lang` per forzare la lingua di `LangService` (wm-core), con fallback a `document.documentElement.lang` → `it`
- **Animazione di apertura del pannello dettaglio traccia** (drawer laterale destro): oggi appare/scompare istantaneamente via `*ngIf`, va introdotta una transizione slide-in coerente col vecchio widget

Tutto il lavoro è nel repo principale `wm-elements` (`src/app/wm-layer-map/`, `src/app/services/`), **nessuna modifica ai submodule** (`wm-core`, `map-core`, `wm-types`).

## Perché

Il nuovo widget Angular deve raggiungere parità visiva/funzionale col vecchio widget prima di poter sostituire i deployment esistenti. Al momento mancano elementi che i clienti si aspettano di vedere (CTA per scaricare l'app, badge store, nome layer) e il pannello di dettaglio si apre in modo meno curato (nessuna animazione), peggiorando la percezione di qualità rispetto al widget storico.

## Requisiti

- [ ] CTA app-link: icona (da `app-icon-url` o calcolata via shard/appId, con fallback a asset locale bundlato su errore di caricamento immagine), label (da `cta-label` o nome app da config, fallback `Webmapp`), sottotitolo fisso "Apri la web app"
- [ ] URL CTA: da `cta-url` se esplicito, altrimenti costruito con `https://${appId}.${dominio}/` + query `?layer=<layerId>` se `layerId` è numerico, dove `dominio` segue la stessa logica di `EnvironmentService.shareLink` (`${subdomain}.webmapp.it`, con `subdomain='app'` per `geohub`) **tranne** per due eccezioni con dominio proprio, gestite con una piccola mappa locale nel widget (non in `wm-core`): `osm2cai` → `osm2cai.cai.it`, `maphub` → `maphub.it`
- [ ] Layer badge: mostra il nome/etichetta del layer corrente in top-bar destra, non cliccabile
- [ ] Badge store: mostrato solo per la piattaforma rilevata via `navigator.userAgent` (iOS → App Store, Android → Google Play, desktop → nessun badge), URL da `ios-store-url`/`android-store-url` o dal campo `APP.iosStore`/`APP.androidStore` già disponibile nel conf store (`wm-core`, selector `confAPP`)
- [ ] Attributo `hide-cta`: nasconde CTA app-link e badge store (stesso comportamento del vecchio widget)
- [ ] Attributo `lang`: imposta la lingua di `LangService` (wm-core) all'avvio del widget, fallback `document.documentElement.lang` → `it`
- [ ] Animazione apertura pannello dettaglio: transizione CSS su `transform`/`opacity` (mai `width`/`height`/`top`/`left`), durata 150-300ms, easing `ease-out` in apertura / `ease-in` in chiusura, full-width sotto i 600px come nel vecchio widget
- [ ] `[UX]` Rispettare `prefers-reduced-motion`: disabilitare/ridurre la transizione del pannello per utenti che lo richiedono
- [ ] `[UX]` Focus management sul pannello dettaglio: alla sua apertura lo scroll/focus deve spostarsi in modo prevedibile (non focus-trap invasivo, ma il pulsante di chiusura deve essere raggiungibile via tastiera e avere `aria-label`)
- [ ] `[UX]` CTA e badge store devono avere stati hover/focus visibili (focus ring, non solo hover) e target touch minimi 44×44px
- [ ] `[UX]` Badge store/layer/icona: alt text/aria-label descrittivi, nessuna informazione veicolata solo dal colore
- [ ] `[UX]` Layout CTA/badge basato su `start`/`end` logici (non `left`/`right` fissi) per corretto mirroring in lingue RTL
- [ ] Logica di detection piattaforma e calcolo URL icona/dominio isolata in un servizio dedicato e testabile (non metodi privati nel component), così riusabile da futuri widget del repo

## Rischi

- **Dominio CTA per shard non ancora noti**: la mappa di eccezioni copre solo `osm2cai`/`maphub` (unici casi noti divergenti da `<shard>.webmapp.it`); se in futuro arriva un nuovo shard con dominio proprio non aggiunto alla mappa, la CTA punterà a un dominio sbagliato in modo silenzioso — mitigato dal fatto che è la stessa lista di eccezioni nota e usata dal vecchio widget, quindi nessuna regressione rispetto allo stato attuale
- **`navigator.userAgent` per il rilevamento piattaforma è fragile**: iPad con UA desktop (default da iPadOS 13+) si presenta come Mac e non riceverebbe il badge App Store; Chrome sta riducendo progressivamente la UA string. Accettato perché è lo stesso approccio (e lo stesso limite) del vecchio widget — nessuna regressione, ma non un miglioramento
- **Icona app**: nessun campo `config.json` fornisce l'icona (verificato nel vecchio widget); si userà solo attributo esplicito + URL calcolato da shard/appId + fallback locale su errore — se l'endpoint icona non esiste per uno shard, l'icona sparisce silenziosamente (comportamento identico al vecchio widget, quindi non è una regressione)
- **`hide-cta` non copre il layer badge**: uno scenario white-label che voglia nascondere anche il nome layer non è coperto da nessun attributo — accettato perché non richiesto esplicitamente e assente anche nel vecchio widget (che non aveva il layer badge)
- **Attributi del widget come superficie API pubblica**: una volta che i clienti li usano negli embed, rinominarli in futuro è breaking change; nessuna validazione formale dei valori (es. `lang` non supportato, `cta-url` malformato) è prevista in questo ciclo — accettato, coerente con l'approccio già in uso per gli attributi esistenti (`shard`, `app-id`, `layer-id`)
- `[UX]` **Animazione pannello non testata su dispositivi reali**: il timing 150-300ms è una linea guida generale: va validato manualmente su mobile reale (non solo demo desktop) prima del rilascio, specialmente per il comportamento full-width sotto 600px e per l'interazione fra `prefers-reduced-motion` e drawer full-width (il fallback ridotto deve restare un fade semplice, non un instant-snap che sembra un bug)

## Out of scope

- Correzione del dominio errato in `EnvironmentService.shareLink` per `osm2cai`/`maphub` (richiederebbe modifiche a `wm-core`)
- Layer switcher, ricerca/filtri, elenco tracce/POI testuale, condivisione esplicita — assenti anche nel vecchio widget, non richiesti
- Modifiche a qualsiasi submodule (`wm-core`, `map-core`, `wm-types`)

## Moduli toccati

- `src/app/wm-layer-map/wm-layer-map.component.ts` — nuovi `@Input()` (`cta-label`, `cta-url`, `app-icon-url`, `ios-store-url`, `android-store-url`, `hide-cta`, `lang`), logica piattaforma/store, integrazione `LangService`
- `src/app/wm-layer-map/wm-layer-map.component.html` — markup CTA, layer badge, badge store
- `src/app/wm-layer-map/wm-layer-map.component.scss` — stili CTA/badge, transizione slide-in pannello, media query full-width sotto 600px
- `src/app/services/` — eventuale nuovo servizio per detection piattaforma (iOS/Android) e/o calcolo URL icona, riusando `WidgetEnvironmentService`/`EnvironmentService` esistenti
- `test/wm-layer-map/index.html` — pagina di verifica manuale aggiornata con i nuovi scenari (CTA visibile/nascosta, badge store per piattaforma, animazione pannello)
