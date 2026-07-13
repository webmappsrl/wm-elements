> Ticket: oc:8252

# Notes — wm-layer-map Angular

## Deviazioni dal piano

**Task 1 — dipendenze e configurazione TypeScript più estese del previsto.**

Il piano assumeva che bastasse installare poche dipendenze runtime ovvie (`@ngrx/store`, `@ngrx/effects`, `chart.js`, `ol`, `@ionic/angular`). In pratica sono emerse tre categorie di problemi bloccanti, risolti in questo ordine:

1. **Elenco dipendenze incompleto.** Un giro di ispezione più ampio (confronto con `wm-webapp/package.json`, fonte di verità già funzionante con gli stessi submodule) ha rivelato ~25 package aggiuntivi usati da `wm-core`/`map-core`/`wm-types` (plugin Capacitor, `@ngx-translate/*`, `swiper`, `posthog-js`, `ts-md5`, `geojson-to-kml`, ecc.), non scopribili senza eseguire davvero la build e leggere gli errori `TS2307` uno per uno. Elenco completo installato, versioni allineate a quelle di `wm-webapp`.
2. **`tsconfig.json` troppo strict.** Il generatore Angular 20 (`ng new`) abilita di default `"strict": true` e `useDefineForClassFields: true`. Il codice di `wm-core` è scritto assumendo le impostazioni più permissive già in uso in `wm-webapp` (niente `strict`, `useDefineForClassFields: false`, `moduleResolution` compatibile). Allineato `tsconfig.json` di `wm-elements` a quello di `wm-webapp` (stesse `compilerOptions`, stessi `paths` extra per `@ionic/core`, `@ionic/angular`, `swiper`).
3. **`tsconfig.app.json` includeva l'intero albero dei submodule.** Il default generato usa `"include": ["src/**/*.ts"]`, che forza TypeScript a compilare anche codice morto/non raggiunto (es. `storage.service.ts` con riferimenti Capacitor Filesystem non importati correttamente, `store/conf/mock.ts`) mai effettivamente usato dal nostro widget. `wm-webapp` invece usa `"files": ["src/main.ts", ...]` + `"include": ["src/**/*.d.ts"]`, lasciando che sia il grafo delle import a decidere cosa compilare. Applicato lo stesso pattern — risolve la maggior parte degli errori residui senza dover toccare i submodule.

**Submodule non allineati al commit usato da `wm-webapp`.** `git submodule add` clona di default la punta del branch predefinito di ciascun repo, non il commit specifico già usato/testato in produzione da `wm-webapp`. Per `wm-core` questo significava puntare al branch `change-environment` invece che al commit pinnato in `wm-webapp` (`eeee910...`). Corretto con `git checkout <sha>` sugli stessi commit esatti di `wm-webapp` per tutti e tre i submodule (`map-core`, `wm-core`, `wm-types`), per costruire contro codice già verificato e non contro lavoro in corso.

## Bug trovati

Nessuno nel codice applicativo scritto finora (siamo ancora nel Task 1 — scaffold). I problemi sopra sono di configurazione/dipendenze, non bug nella logica implementata.

## Decisioni

- Dipendenze runtime/dev installate: vedi elenco completo nel commit del Task 1 (`package.json`).
- `tsconfig.json`/`tsconfig.app.json` allineati 1:1 alle impostazioni non-strict di `wm-webapp` invece di lasciare i default di `ng new` — necessario per compilare i submodule senza modificarli.
- Submodule pinnati agli stessi commit esatti di `wm-webapp` (non alla punta dei branch) per garantire di costruire su codice già testato.

## Follow-up

- Da verificare nei prossimi task: se aggiornare in futuro un submodule (es. per una nuova feature `wm-core`), ripetere la stessa disciplina — pinnare a un commit noto, non alla punta del branch, e rilanciare `ng build` per scoprire nuove dipendenze mancanti prima di procedere.
