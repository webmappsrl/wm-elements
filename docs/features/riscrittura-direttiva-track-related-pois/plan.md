# Riscrittura direttiva track related POI — Piano implementativo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire nel widget `wm-layer-map` la direttiva legacy `WmMapTrackRelatedPoisDirective` di map-core con una nuova direttiva standalone riscritta da zero nel repo principale, a parità di comportamento visibile, eliminando la classe di bug di selezione/deselezione by design.

**Architecture:** Nuova direttiva `WmelMapTrackRelatedPoisDirective` (selettore `wmelMapTrackRelatedPois`) + modulo di funzioni pure per la costruzione dei marker. Selezione pilotata da un'unica pipeline RxJS (`switchMap`) alimentata dal solo binding dello store; click via dispatcher centrale di map-core; rendering marker con canvas 2D nativo (niente `imgSize` deprecato né SVG `foreignObject`).

**Tech Stack:** Angular 20 (direttiva standalone), OpenLayers 7.1, RxJS 7.8, utility pure di `@map-core/*` (submodule intatto).

**Spec di riferimento:** `docs/features/riscrittura-direttiva-track-related-pois/overview.md` — sezione "Specifica funzionale" (contratto autonomo e vincolante).

## Global Constraints

- **Nessuna modifica ai submodule** (`src/app/shared/map-core`, `wm-core`, `wm-types`): solo import via alias `@map-core/*`, `@wm-core/*`, `@wm-types/*`.
- **Parità visiva vince sulle best practice**: se una scelta implementativa cambia il rendering osservabile rispetto a webapp/legacy, si replica il comportamento legacy (regola CLAUDE.md del repo).
- **Node**: eseguire `nvm use` in ogni nuova shell prima di qualsiasi comando `ng`/`npm run`.
- **Verifica**: nessun test automatico in questo repo (convenzione) — compile-check con `npx tsc -p tsconfig.app.json --noEmit` + verifica manuale in demo (`npm run start:demo`).
- **Commit**: convenzione `feat(riscrittura-direttiva-track-related-pois): ...`. ⚠️ **I comandi git nei task sono istruzioni testuali: ogni commit va eseguito solo dopo conferma esplicita del developer** (gate di review Webmapp). Nessun `git add`/`commit`/`push` autonomo.
- **Selettore nuovo obbligatorio**: `wmelMapTrackRelatedPois` — il selettore legacy resterebbe in scope via `WmCoreModule` → stesso selettore = doppia istanza.
- **Z-index**: layer marker related = `CLUSTER_ZINDEX + 1` (506), layer selezione = `CLUSTER_ZINDEX + 2` (507) — i related devono vincere il routing click del dispatcher sui POI globali (`CLUSTER_ZINDEX` = 505).

---

### Task 1: Modulo marker — funzioni pure di rendering

**Files:**
- Create: `src/app/wm-layer-map/directives/track-related-pois.markers.ts`

**Interfaces:**
- Consumes: `downloadBase64Img`, `fromHEXToColor` da `@map-core/utils`; `DEF_LINE_COLOR`, `ICN_PATH`, `logoBase64` da `@map-core/readonly`; `WmFeature` da `@wm-types/feature`.
- Produces: `createRelatedPoiMarker(poi: WmFeature<Point>, options: RelatedPoiMarkerOptions): Promise<Feature<Geometry> | null>` e `interface RelatedPoiMarkerOptions {poiIcons: {[identifier: string]: string}; selected: boolean; existingFeature?: Feature<Geometry> | null}` — usati dal Task 2.

Contratto (dalla Specifica funzionale): precedenza foto → icona SVG → PNG fallback; `null` se il POI non ha alcuna via di rendering; **mai** eccezioni non gestite verso il chiamante per la pipeline foto (degrada a icona).

- [ ] **Step 1: Crea il file con il codice completo**

```typescript
import {Point} from 'geojson';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import {Point as OlPoint} from 'ol/geom';
import {fromLonLat} from 'ol/proj';
import Icon from 'ol/style/Icon';
import Style from 'ol/style/Style';
import {DEF_LINE_COLOR, ICN_PATH, logoBase64} from '@map-core/readonly';
import {downloadBase64Img, fromHEXToColor} from '@map-core/utils';
import {WmFeature} from '@wm-types/feature';

export interface RelatedPoiMarkerOptions {
  /** set di icone SVG dell'app, indicizzate per identifier/icon_name */
  poiIcons: {[identifier: string]: string};
  selected: boolean;
  /** feature OL preesistente (dai POI globali) da riusare al posto di crearne una nuova */
  existingFeature?: Feature<Geometry> | null;
}

const MARKER_SIZE = 46;
const HALO_RADIUS = 23;
const PHOTO_RADIUS = 18;

/**
 * Costruisce la feature-marker di un related POI (contratto in
 * docs/features/riscrittura-direttiva-track-related-pois/overview.md).
 * Precedenza: foto (show_image_on_map / 108x137) → icona SVG ricolorata →
 * PNG ICN_PATH. Un fallimento della pipeline foto (CORS, immagine rotta)
 * degrada all'icona; ritorna null se il POI non ha alcuna via di rendering.
 */
export async function createRelatedPoiMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Promise<Feature<Geometry> | null> {
  const properties = poi.properties ?? null;
  if (properties == null) {
    return null;
  }
  const showImageOnMap = (properties as any).feature_image?.show_image_on_map;
  const usePhoto =
    showImageOnMap === true ||
    (showImageOnMap == null && (properties as any).feature_image?.sizes?.['108x137'] != null);

  if (usePhoto) {
    try {
      return await createPhotoMarker(poi, options);
    } catch {
      // foto rotta o fetch CORS fallito sul dominio host: si degrada all'icona
    }
  }
  return createIconMarker(poi, options);
}

async function createPhotoMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Promise<Feature<Geometry>> {
  const properties: any = poi.properties;
  const url = properties.feature_image?.sizes?.['108x137'];
  const imgB64 = url != null ? ((await downloadBase64Img(url)) as string) : (logoBase64 as string);
  const feature = buildPointFeature(poi, options.existingFeature);

  // Parità legacy: se il poi_type ha un'icona nel set dell'app, l'icona
  // vince sulla foto (caso raro: i related POI di norma non hanno
  // taxonomyIdentifiers).
  const poiTypeIdentifiers: string[] = (properties.taxonomyIdentifiers ?? []).filter(
    (p: string) => p.indexOf('poi_type') > -1,
  );
  if (poiTypeIdentifiers.length === 1 && options.poiIcons[poiTypeIdentifiers[0]] != null) {
    let svgIcon = options.poiIcons[poiTypeIdentifiers[0]];
    if (options.selected) {
      svgIcon = svgIcon
        .replace('darkorange', 'temp')
        .replace('white', 'darkorange')
        .replace('temp', 'white');
    }
    feature.setStyle(
      new Style({
        zIndex: 200,
        image: new Icon({
          anchor: [0.5, 0.5],
          scale: 1,
          src: `data:image/svg+xml;utf8,${svgIcon}`,
        }),
      }),
    );
    return feature;
  }

  const canvas = await drawPhotoCanvas(imgB64, options.selected);
  feature.setStyle(
    new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        // canvas.toDataURL: dimensioni intrinseche, niente imgSize (deprecato in OL7)
        src: canvas.toDataURL('image/png'),
      }),
    }),
  );
  return feature;
}

async function drawPhotoCanvas(imgB64: string, selected: boolean): Promise<HTMLCanvasElement> {
  const img = await loadImage(imgB64);
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_SIZE;
  canvas.height = MARKER_SIZE;
  const ctx = canvas.getContext('2d');
  const c = MARKER_SIZE / 2;

  // alone esterno (opacità piena da selezionato, come la legacy)
  ctx.globalAlpha = selected ? 1 : 0.2;
  ctx.fillStyle = DEF_LINE_COLOR;
  ctx.beginPath();
  ctx.arc(c, c, HALO_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // foto ritagliata nel cerchio interno, cover centrato
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, PHOTO_RADIUS, 0, Math.PI * 2);
  ctx.clip();
  const d = PHOTO_RADIUS * 2;
  const scale = Math.max(d / img.width, d / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, c - w / 2, c - h / 2, w, h);
  ctx.restore();

  // bordo bianco del cerchio foto
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.arc(c, c, PHOTO_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  return canvas;
}

function createIconMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Feature<Geometry> | null {
  const existing = options.existingFeature ?? null;
  const properties: any = existing != null ? existing.getProperties() : poi.properties;
  // Come la legacy: senza feature globale riusabile e senza taxonomy non
  // esiste una via di rendering (il ramo legacy `else if (svgIcon)` era
  // irraggiungibile: svgIcon derivava dalla stessa taxonomy).
  if (existing == null && properties?.taxonomy == null) {
    return null;
  }
  const taxonomy = properties.taxonomy ?? null;
  const poiType = taxonomy?.poi_type ?? null;
  const svgFromIcons =
    poiType?.icon_name && options.poiIcons[poiType.icon_name] != null
      ? options.poiIcons[poiType.icon_name]
      : null;
  let icn = getIcnFromTaxonomies(properties.taxonomyIdentifiers ?? poiType?.identifier);
  if (!icn && poiType?.icon_name) {
    icn = poiType.icon_name;
  }

  // ternari identici alla legacy (un color === '' deve comportarsi uguale)
  const poiColor = poiType?.color ? poiType.color : properties.color ? properties.color : '#ff8c00';
  const namedPoiColor = fromHEXToColor[poiColor] || 'darkorange';

  let iconStyle: Style;
  if (svgFromIcons != null) {
    let processedSvg = svgFromIcons.split('darkorange').join(namedPoiColor);
    if (options.selected) {
      // parità legacy: con namedPoiColor !== 'darkorange' il replace del
      // circle non matcha nulla — comportamento voluto, non "correggerlo"
      processedSvg = processedSvg
        .replace(/<circle fill="darkorange"/g, '<circle fill="white" ')
        .replace(/<g fill="white"/g, `<g fill="${namedPoiColor || 'darkorange'}" `);
    }
    iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        scale: 1,
        src: `data:image/svg+xml;utf8,${processedSvg}`,
      }),
    });
  } else {
    iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        scale: 0.5,
        src: `${ICN_PATH}/${icn}.png`,
      }),
    });
  }
  if (properties.svgIcon != null && svgFromIcons == null) {
    let src = `data:image/svg+xml;utf8,${properties.svgIcon.replaceAll(
      'darkorange',
      namedPoiColor,
    )}`;
    if (options.selected) {
      src = `data:image/svg+xml;utf8,${properties.svgIcon
        .replaceAll(`<circle fill="darkorange"`, '<circle fill="white" ')
        .replaceAll(`<g fill="white"`, `<g fill="${namedPoiColor || 'darkorange'}" `)}`;
    }
    iconStyle = new Style({
      image: new Icon({anchor: [0.5, 0.5], scale: 1, src}),
    });
  }
  const feature = buildPointFeature(poi, existing);
  feature.setStyle(iconStyle);
  return feature;
}

function buildPointFeature(
  poi: WmFeature<Point>,
  existing?: Feature<Geometry> | null,
): Feature<Geometry> {
  if (existing != null) {
    // Attenzione (parità): riusare la feature dei POI globali muta il suo
    // stile anche nel layer di wmMapPois — effetto legacy voluto, vedi overview.
    return existing;
  }
  const [lon, lat] = poi.geometry.coordinates as number[];
  const position = fromLonLat([lon, lat]);
  const feature = new Feature({type: 'icon', geometry: new OlPoint(position)});
  feature.setId(poi.properties.id);
  return feature;
}

function getIcnFromTaxonomies(taxonomyIdentifiers: string[] | string | null | undefined): string {
  if (taxonomyIdentifiers == null) {
    return null;
  }
  const identifiers: string[] = Array.isArray(taxonomyIdentifiers)
    ? taxonomyIdentifiers
    : typeof taxonomyIdentifiers === 'string' && taxonomyIdentifiers.length > 0
      ? [taxonomyIdentifiers]
      : [];
  const excludedIcn = ['theme_ucvs'];
  const res = identifiers.filter(
    p => p != null && excludedIcn.indexOf(p) === -1 && p.indexOf('poi_type') > -1,
  );
  return res.length > 0 ? res[0] : identifiers.length > 0 ? identifiers[0] : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

- [ ] **Step 2: Compile check**

Run: `nvm use && npx tsc -p tsconfig.app.json --noEmit`
Expected: nessun errore (il file non è ancora importato da nessuno, deve solo compilare).

- [ ] **Step 3: Commit (istruzione per il developer — eseguire solo dopo conferma esplicita)**

```bash
git add src/app/wm-layer-map/directives/track-related-pois.markers.ts
git commit -m "feat(riscrittura-direttiva-track-related-pois): add pure marker builder for related POIs"
```

---

### Task 2: La nuova direttiva standalone

**Files:**
- Create: `src/app/wm-layer-map/directives/track-related-pois.directive.ts`

**Interfaces:**
- Consumes: `createRelatedPoiMarker`/`RelatedPoiMarkerOptions` dal Task 1; `WmMapComponent` (`isInit$`, `map`, `fitView`, `registerDirective`, `wmMapEmptyClickEVT$`) da `@map-core/components/map/map.component`; `createLayer`, `nearestFeatureOfLayer`, `calculateNearestPoint`, `isArrayContained` da `@map-core/utils`; `CLUSTER_ZINDEX` da `@map-core/readonly`.
- Produces (per il Task 3): classe `WmelMapTrackRelatedPoisDirective`, selettore `[wmelMapTrackRelatedPois]`, standalone. Firma pubblica: input `track`, `related-current-ec-poi-id`, `wmMapPoisPois`, `wmMapPoisFilters`, `wmMapReletedPoisDisableClusterLayer`, `wmTrackRelatedPoiIcons`, `next`, `wmMapPositioncurrentLocation`, `wmMapTrackRelatedPoisAlertPoiRadius`; output `related-poi` (`EventEmitter<WmFeature<Point> | null>`), `related-poi-click` (`EventEmitter<number>`), `wmMapTrackRelatedPoisNearestPoiEvt` (`EventEmitter<Feature<Geometry>>`); metodi `poiNext(): void`, `poiPrev(): void`; campo `currentRelatedPoi$: BehaviorSubject<WmFeature<Point> | null>`.

Regole architetturali vincolanti (da overview/challenge):
- **Unico scrittore**: la selezione visiva è applicata solo dalla pipeline alimentata da `related-current-ec-poi-id`. Click e `poiNext`/`poiPrev` **emettono soltanto** (`related-poi`), mai selezione interna.
- **Pipeline unica con `switchMap`**: ogni nuovo id annulla l'applicazione in volo; deselezione sincrona; guardie post-`await` su epoch/valore corrente.
- **Dispatcher centrale**: `registerDirective` su entrambi i layer, `onClick(evt)` come entry point, `wmMapEmptyClickEVT$` per il click a vuoto. Nessun `map.on('click')`.
- **Layer creati una volta e riusati** (`source.clear()`), rimossi solo in `ngOnDestroy`.
- **Isolamento errori**: `onClick` e la costruzione marker non lasciano mai uscire eccezioni.

- [ ] **Step 1: Crea il file con il codice completo**

```typescript
import {
  Directive,
  EventEmitter,
  Host,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {BehaviorSubject, Subject, firstValueFrom, from, of} from 'rxjs';
import {catchError, distinctUntilChanged, filter, switchMap, take, takeUntil} from 'rxjs/operators';
import {Point} from 'geojson';
import {MapBrowserEvent} from 'ol';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Icon from 'ol/style/Icon';
import Style from 'ol/style/Style';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {CLUSTER_ZINDEX} from '@map-core/readonly';
import {
  calculateNearestPoint,
  createLayer,
  isArrayContained,
  nearestFeatureOfLayer,
} from '@map-core/utils';
import {WmFeature} from '@wm-types/feature';
import {createRelatedPoiMarker} from './track-related-pois.markers';

// I related POI devono vincere il routing click del dispatcher centrale
// sui POI globali (CLUSTER_ZINDEX): il dispatcher instrada il click alla
// direttiva del layer con z-index più alto al pixel.
const RELATED_POIS_ZINDEX = CLUSTER_ZINDEX + 1;
const SELECTED_RELATED_POI_ZINDEX = CLUSTER_ZINDEX + 2;

interface RelatedPoiMarker {
  id: number;
  poi: WmFeature<Point>;
  feature: Feature<Geometry>;
}

/**
 * Riscrittura della legacy WmMapTrackRelatedPoisDirective di map-core
 * (contratto completo in docs/features/riscrittura-direttiva-track-related-pois/overview.md).
 * Unico scrittore: la selezione visiva è pilotata solo dal binding
 * `related-current-ec-poi-id`; click e poiNext/poiPrev emettono soltanto.
 */
@Directive({
  selector: '[wmelMapTrackRelatedPois]',
  standalone: true,
})
export class WmelMapTrackRelatedPoisDirective implements OnChanges, OnDestroy {
  private _buildEpoch = 0;
  private _destroy$ = new Subject<void>();
  private _filters: string[] = [];
  private _globalPoisSource: VectorSource | null = null;
  private _lastTrackId: number | string | null = null;
  private _markers: RelatedPoiMarker[] = [];
  private _markersReady$ = new BehaviorSubject<boolean>(false);
  private _poiIcons: {[identifier: string]: string} = {};
  private _poisLayer: VectorLayer<VectorSource> | null = null;
  private _selectId$ = new BehaviorSubject<number | null>(null);
  private _selectedLayer: VectorLayer<VectorSource> | null = null;

  @Input() track: WmFeature<any> | null;
  @Input() wmMapPositioncurrentLocation: Location;
  @Input() wmMapTrackRelatedPoisAlertPoiRadius: number;

  @Input('related-current-ec-poi-id') set setPoi(id: number | 'reset' | null) {
    // contratto legacy: -1 / null / 'reset' (o qualsiasi non-numero) = deselezione
    this._selectId$.next(typeof id === 'number' && id !== -1 ? id : null);
  }

  @Input() set next(_: unknown) {
    // contratto legacy: rimuove l'evidenziazione corrente
    this._clearSelectedLayer();
  }

  @Input() set wmMapPoisPois(features: WmFeature<Point>[] | null) {
    if (features == null || features.length === 0) {
      return;
    }
    try {
      const olFeatures = new GeoJSON({featureProjection: 'EPSG:3857'}).readFeatures({
        type: 'FeatureCollection',
        features,
      });
      olFeatures.forEach(f => f.setId(f.getProperties().id));
      this._globalPoisSource = new VectorSource({features: olFeatures});
    } catch {
      this._globalPoisSource = null;
    }
  }

  @Input() set wmMapPoisFilters(filters: string[] | null) {
    const normalized = filters ?? [];
    if (JSON.stringify(normalized) === JSON.stringify(this._filters)) {
      return;
    }
    this._filters = normalized;
    this._updateFilteredPois();
  }

  @Input() set wmMapReletedPoisDisableClusterLayer(disabled: boolean) {
    this._poisLayer?.setVisible(!disabled);
  }

  @Input() set wmTrackRelatedPoiIcons(poiIcons: {[identifier: string]: string}) {
    this._poiIcons = poiIcons ?? {};
  }

  @Output('related-poi') relatedPoiEvt = new EventEmitter<WmFeature<Point> | null>();
  @Output('related-poi-click') poiClick = new EventEmitter<number>();
  @Output() wmMapTrackRelatedPoisNearestPoiEvt = new EventEmitter<Feature<Geometry>>();

  currentRelatedPoi$ = new BehaviorSubject<WmFeature<Point> | null>(null);

  constructor(@Host() public mapCmp: WmMapComponent) {
    // Pipeline unica di selezione: ogni nuovo id annulla l'applicazione in
    // volo (switchMap); la deselezione ha effetto sincrono e definitivo.
    this._selectId$
      .pipe(
        distinctUntilChanged(),
        switchMap(id => {
          if (id == null) {
            this._clearSelection();
            return of(null);
          }
          // una selezione arrivata prima che i marker esistano resta
          // pendente e si applica appena pronti — o viene annullata dal
          // valore successivo
          return this._markersReady$.pipe(
            filter(ready => ready),
            take(1),
            switchMap(() => from(this._applySelection(id))),
            catchError(() => of(null)),
          );
        }),
        takeUntil(this._destroy$),
      )
      .subscribe();

    // Click a vuoto dal dispatcher centrale. Guardia sulla selezione attiva:
    // wmMapEmptyClickEVT$ è un ReplaySubject(1) e ripropone l'ultimo click
    // a vuoto alla subscribe — senza guardia deselezionerebbe all'init.
    this.mapCmp.wmMapEmptyClickEVT$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      if (this._selectId$.value != null) {
        this.relatedPoiEvt.emit(null);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.track) {
      const track = changes.track.currentValue;
      const trackId = track?.properties?.id ?? null;
      // NgRx ricrea i riferimenti oggetto: stessa traccia (stesso id) =
      // nessun reset, nessuna ricreazione marker
      if (trackId !== this._lastTrackId) {
        this._lastTrackId = trackId;
        this._reset();
        const relatedPois = track?.properties?.related_pois;
        if (Array.isArray(relatedPois) && relatedPois.length > 0) {
          this._relatedPois = relatedPois;
          void this._buildMarkers();
        }
      }
    }
    if (changes.wmMapPositioncurrentLocation?.currentValue != null && this._poisLayer != null) {
      const nearestPoi = calculateNearestPoint(
        changes.wmMapPositioncurrentLocation.currentValue,
        this._poisLayer,
        this.wmMapTrackRelatedPoisAlertPoiRadius,
      );
      if (nearestPoi != null) {
        try {
          ((nearestPoi.getStyle() as Style).getImage() as Icon).setScale(1.2);
        } catch {
          // stile non-Icon: nessuna evidenziazione, nessun crash
        }
      }
      this.wmMapTrackRelatedPoisNearestPoiEvt.emit(nearestPoi);
    }
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
    if (this.mapCmp.map != null) {
      if (this._poisLayer != null) {
        this.mapCmp.map.removeLayer(this._poisLayer);
      }
      if (this._selectedLayer != null) {
        this.mapCmp.map.removeLayer(this._selectedLayer);
      }
    }
    this._poisLayer = null;
    this._selectedLayer = null;
  }

  /** Entry point del dispatcher centrale (map.component.ts): invocato quando
   * un layer di questa direttiva è il più alto al pixel cliccato. */
  onClick(evt: MapBrowserEvent<UIEvent>): void {
    try {
      const feature =
        this._poisLayer != null
          ? nearestFeatureOfLayer(this._poisLayer, evt, this.mapCmp.map)
          : null;
      if (feature == null) {
        if (this._selectId$.value != null) {
          this.relatedPoiEvt.emit(null);
        }
        return;
      }
      const id = +feature.getId();
      const poi = this._getPoi(id);
      this.poiClick.emit(id);
      if (poi != null) {
        this.relatedPoiEvt.emit(poi);
      }
    } catch {
      // nessuna eccezione deve uscire nel ciclo eventi OL
    }
  }

  poiNext(): void {
    this._emitByOffset(1);
  }

  poiPrev(): void {
    this._emitByOffset(-1);
  }

  /** Emette il POI a distanza `offset` (circolare) da quello selezionato.
   * No-op sicuro senza selezione o senza related POI (niente TypeError). */
  private _emitByOffset(offset: number): void {
    const currentId = this._selectId$.value;
    if (currentId == null || this._relatedPois.length === 0) {
      return;
    }
    const ids = this._relatedPois.map(p => +p.properties.id);
    const idx = ids.indexOf(+currentId);
    if (idx === -1) {
      return;
    }
    const nextPoi = this._relatedPois[(idx + offset + ids.length) % ids.length];
    this.relatedPoiEvt.emit(nextPoi);
  }

  private async _buildMarkers(): Promise<void> {
    const epoch = ++this._buildEpoch;
    try {
      await firstValueFrom(
        this.mapCmp.isInit$.pipe(
          filter(init => init === true),
          take(1),
          takeUntil(this._destroy$),
        ),
      );
    } catch {
      return; // direttiva distrutta prima dell'init della mappa
    }
    if (epoch !== this._buildEpoch || this.mapCmp.map == null) {
      return;
    }
    this._ensureLayers();
    const markers: RelatedPoiMarker[] = [];
    for (const poi of this._relatedPois) {
      try {
        const existing = this._globalPoisSource?.getFeatureById(poi.properties.id) ?? null;
        const feature = await createRelatedPoiMarker(poi, {
          poiIcons: this._poiIcons,
          selected: false,
          existingFeature: existing,
        });
        if (epoch !== this._buildEpoch) {
          return; // reset/cambio traccia sopraggiunto durante il download foto
        }
        if (feature != null) {
          markers.push({id: +poi.properties.id, poi, feature});
        }
      } catch {
        // un POI rotto non blocca gli altri
      }
    }
    if (epoch !== this._buildEpoch) {
      return;
    }
    this._markers = markers;
    this._updateFilteredPois();
    this._markersReady$.next(true);
  }

  /** Crea i layer una sola volta e li registra nel dispatcher centrale. */
  private _ensureLayers(): void {
    if (this._poisLayer == null) {
      this._poisLayer = createLayer(null, RELATED_POIS_ZINDEX);
      this.mapCmp.map.addLayer(this._poisLayer);
      this.mapCmp.registerDirective(this._poisLayer['ol_uid'], this);
    }
    if (this._selectedLayer == null) {
      this._selectedLayer = createLayer(null, SELECTED_RELATED_POI_ZINDEX);
      this.mapCmp.map.addLayer(this._selectedLayer);
      this.mapCmp.registerDirective(this._selectedLayer['ol_uid'], this);
    }
  }

  /** Filtra la source esistente senza ricreare i marker (parità legacy). */
  private _updateFilteredPois(): void {
    if (this._poisLayer == null) {
      return;
    }
    const source = this._poisLayer.getSource();
    source.clear();
    const toShow = this._markers.filter(marker => {
      if (this._filters.length === 0) {
        return true;
      }
      let ids: string[] | null = (marker.poi?.properties as any)?.taxonomyIdentifiers ?? null;
      // i related POI spesso non hanno taxonomyIdentifiers: fallback su
      // taxonomy.poi_type.identifier (parità legacy oc:7646)
      if (ids == null || ids.length === 0) {
        const poiTypeIdentifier = (marker.poi?.properties as any)?.taxonomy?.poi_type?.identifier;
        ids = poiTypeIdentifier ? [`poi_type_${poiTypeIdentifier}`] : null;
      }
      if (ids == null || ids.length === 0) {
        return true;
      }
      return isArrayContained(this._filters, ids);
    });
    source.addFeatures(toShow.map(m => m.feature));
  }

  private async _applySelection(id: number): Promise<void> {
    const marker = this._markers.find(m => m.id === +id);
    if (marker == null) {
      // id non risolvibile a un marker: contratto legacy = deselezione
      this._clearSelection();
      return;
    }
    const epochAtStart = this._buildEpoch;
    const selectedFeature = await createRelatedPoiMarker(marker.poi, {
      poiIcons: this._poiIcons,
      selected: true,
      existingFeature: null,
    });
    // switchMap annulla la subscription ma non l'await già partito:
    // guardie post-await su epoch e valore corrente
    if (epochAtStart !== this._buildEpoch || this._selectId$.value !== id) {
      return;
    }
    const source = this._selectedLayer.getSource();
    source.clear();
    if (selectedFeature != null) {
      source.addFeature(selectedFeature);
    }
    this.mapCmp.fitView(marker.feature.getGeometry() as any, {
      maxZoom: this.mapCmp.map.getView().getZoom(),
      duration: 500,
      size: this.mapCmp.map.getSize(),
    });
    this.currentRelatedPoi$.next(this._getPoi(+id));
  }

  private _clearSelection(): void {
    this._clearSelectedLayer();
    this.currentRelatedPoi$.next(null);
  }

  private _clearSelectedLayer(): void {
    this._selectedLayer?.getSource()?.clear();
  }

  private _reset(): void {
    const hadSelection = this._selectId$.value != null;
    this._buildEpoch++; // invalida qualsiasi _buildMarkers in corso
    this._markersReady$.next(false);
    this._markers = [];
    this._relatedPois = [];
    this._poisLayer?.getSource()?.clear();
    this._clearSelection();
    if (hadSelection) {
      // il widget azzera ec_related_poi in URL/store; senza selezione attiva
      // non si emette (un deep-link related_poi all'avvio non va cancellato)
      this.relatedPoiEvt.emit(null);
    }
  }

  private _getPoi(id: number): WmFeature<Point> | null {
    return this._relatedPois.find(p => +p.properties.id === +id) ?? null;
  }
}
```

- [ ] **Step 2: Compile check**

Run: `nvm use && npx tsc -p tsconfig.app.json --noEmit`
Expected: nessun errore. Se `createLayer(null, ...)` desse errore di tipo (firma `createLayer(layer, zIndex)` senza `| null`), passare `undefined` al posto di `null` — non modificare il submodule.

- [ ] **Step 3: Commit (istruzione per il developer — eseguire solo dopo conferma esplicita)**

```bash
git add src/app/wm-layer-map/directives/track-related-pois.directive.ts
git commit -m "feat(riscrittura-direttiva-track-related-pois): add standalone related POIs directive"
```

---

### Task 3: Wiring del widget sulla nuova direttiva

**Files:**
- Modify: `src/app/wm-layer-map/wm-layer-map.component.html:129-134`
- Modify: `src/app/wm-layer-map/wm-layer-map.component.ts` (import riga 60, `imports` riga 94, ViewChild righe 116-117, subject righe 141-142, subscription righe 403-409, metodi `deselectAllPois`/`setCurrentRelatedPoi`/`poiPrev`/`poiNext`/`setPoi` righe 437-478)

**Interfaces:**
- Consumes: `WmelMapTrackRelatedPoisDirective` dal Task 2 (selettore `wmelMapTrackRelatedPois`, metodi `poiNext()`/`poiPrev()`, output `related-poi`).
- Produces: il widget compila e funziona solo con la nuova direttiva; nessun riferimento residuo alla legacy nel repo principale.

- [ ] **Step 1: Aggiorna il template**

In `wm-layer-map.component.html`, sostituisci il blocco righe 129-134:

```html
    wmMapTrackRelatedPois
    [wmTrackRelatedPoiIcons]="icons$|async"
    [related-current-ec-poi-id]="currentRelatedPoiID$|async"
    (related-poi)="setCurrentRelatedPoi($event)"
    (related-poi-next)="currentPoiNextID$.next(+$event)"
    (related-poi-prev)="currentPoiPrevID$.next(+$event)"
```

con:

```html
    wmelMapTrackRelatedPois
    [wmTrackRelatedPoiIcons]="icons$|async"
    [related-current-ec-poi-id]="currentRelatedPoiID$|async"
    (related-poi)="setCurrentRelatedPoi($event)"
```

I binding `(related-poi-next)`/`(related-poi-prev)` erano morti (output mai esistiti nella legacy) e i loro subject non hanno altri consumer — si rimuovono qui e nel componente (Step 2). Gli input condivisi `[track]` (riga 125, sotto `wmMapTrack`) e `[wmMapPoisPois]` (riga 121, sotto `wmMapPois`) raggiungono la nuova direttiva senza modifiche: stesso nome di input, stesso host.

- [ ] **Step 2: Aggiorna il componente**

In `wm-layer-map.component.ts`:

1. Riga 60 — rimuovi `WmMapTrackRelatedPoisDirective` dall'import di `@map-core/directives` (lascia `WmMapPoisDirective`) e aggiungi:

```typescript
import {WmelMapTrackRelatedPoisDirective} from './directives/track-related-pois.directive';
```

2. Riga 94 — aggiungi la direttiva agli `imports` del componente standalone:

```typescript
imports: [CommonModule, WmCoreModule, IonicModule, WmLayerMapDirective, WmLayerMapPoiPanelComponent, WmelMapTrackRelatedPoisDirective],
```

3. Righe 116-117 — sostituisci il ViewChild:

```typescript
  @ViewChild(WmelMapTrackRelatedPoisDirective)
  relatedPoisDirective: WmelMapTrackRelatedPoisDirective;
```

4. Righe 141-142 — elimina le dichiarazioni orfane:

```typescript
  currentPoiNextID$: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
  currentPoiPrevID$: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
```

5. Righe 403-409 (`ngAfterViewInit`) — elimina l'intera subscription a `currentRelatedPoiID$` (la deselezione da store arriva ora dal binding: la direttiva tratta `null` come deselezione):

```typescript
        this.currentRelatedPoiID$
          .pipe(distinctUntilChanged(), takeUntil(this._destroy$))
          .subscribe(id => {
            if (id == null && this.WmMapTrackRelatedPoisDirective != null) {
              this.WmMapTrackRelatedPoisDirective.setPoi = -1;
            }
          });
```

6. `deselectAllPois()` (righe 437-444) — rimuovi la scrittura imperativa:

```typescript
  /** Deseleziona related POI e azzera lo stato URL/store. */
  deselectAllPois(): void {
    this._urlHandlerSvc.updateURL({poi: undefined, ec_related_poi: undefined});
    this.resetSelectedPoi$.next(!this.resetSelectedPoi$.value);
    this._clearGenericPoiMarker();
  }
```

7. `setCurrentRelatedPoi()` (righe 446-459) — unico scrittore: solo URL/store, e gestione esplicita di `null` (emesso dalla direttiva su deselezione da click a vuoto o cambio traccia):

```typescript
  setCurrentRelatedPoi(feature: number | WmFeature<Point> | null): void {
    if (feature == null) {
      this._urlHandlerSvc.updateURL({ec_related_poi: undefined});
    } else if (typeof feature === 'number') {
      this._urlHandlerSvc.updateURL({ec_related_poi: feature});
    } else if (feature.properties != null && feature.properties.id != null) {
      this._urlHandlerSvc.updateURL({ec_related_poi: feature.properties.id});
    }
  }
```

8. `poiPrev()`/`poiNext()` (righe 465-471) — puntano al nuovo ViewChild (la direttiva emette, la selezione torna dal binding):

```typescript
  poiPrev(): void {
    this.relatedPoisDirective?.poiPrev();
  }

  poiNext(): void {
    this.relatedPoisDirective?.poiNext();
  }
```

9. `setPoi()` (righe 473-478) — rimuovi la scrittura imperativa (la mutua esclusione poi/ec_related_poi è già gestita da `LocalUrlHandlerService`; l'azzeramento di `ec_related_poi` arriva alla direttiva via binding):

```typescript
  setPoi(poi: WmFeature<Point>): void {
    this._urlHandlerSvc.updateURL({poi: poi?.properties?.id ? +poi.properties.id : undefined});
  }
```

- [ ] **Step 3: Verifica assenza di riferimenti residui alla legacy nel repo principale**

Run: `grep -rn "WmMapTrackRelatedPoisDirective\|wmMapTrackRelatedPois" src/app --include="*.ts" --include="*.html" | grep -v "src/app/shared"`
Expected: nessun risultato.

- [ ] **Step 4: Compile check + avvio demo**

Run: `nvm use && npx tsc -p tsconfig.app.json --noEmit && npm run start:demo`
Expected: compilazione pulita, demo raggiungibile su `http://localhost:4200`, mappa renderizzata con marker related POI su una traccia selezionata.

- [ ] **Step 5: Commit (istruzione per il developer — eseguire solo dopo conferma esplicita)**

```bash
git add src/app/wm-layer-map/wm-layer-map.component.html src/app/wm-layer-map/wm-layer-map.component.ts
git commit -m "feat(riscrittura-direttiva-track-related-pois): wire widget to new directive, single-writer selection"
```

---

### Task 4: Repoint del submodule map-core a upstream

**Files:**
- Modify: puntatore submodule `src/app/shared/map-core` (nessun file del submodule viene toccato)

**Interfaces:**
- Consumes: nulla dai task precedenti (ma va eseguito **dopo** il Task 3: da questo momento il repo non usa più la direttiva legacy, quindi perdere il fix `8a36293` è irrilevante).
- Produces: submodule puntato a `15c4f21` (upstream `develop`), nessun commit locale non-pushato richiesto per la build.

- [ ] **Step 1: Verifica lo stato del submodule**

Run: `git -C src/app/shared/map-core rev-parse HEAD && git -C src/app/shared/map-core status --short`
Expected: HEAD = `15c4f21eae9b71b3f5ae3f8b03bf70db0854bb6f` (già checked-out); tra i file modificati **solo** ` M src/utils/ol.ts` (diff locale consapevole, estraneo alla feature — NON scartarlo, NON committarlo: resta documentato in notes.md con follow-up upstream separato).

⚠️ Se HEAD non fosse `15c4f21...`, fermarsi e segnalare al developer — non eseguire checkout nel submodule senza conferma (rischio di perdere il diff a `ol.ts`).

- [ ] **Step 2: Commit del nuovo puntatore (istruzione per il developer — eseguire solo dopo conferma esplicita)**

`git add src/app/shared/map-core` registra il puntatore al commit checked-out (15c4f21), non il contenuto del diff non committato:

```bash
git add src/app/shared/map-core
git commit -m "feat(riscrittura-direttiva-track-related-pois): repoint map-core to upstream develop"
```

- [ ] **Step 3: Verifica riproducibilità da clone pulito (simulata)**

Run: `git -C src/app/shared/map-core branch -r --contains 15c4f21 | head -3`
Expected: almeno un branch remoto (es. `origin/develop`) contiene il commit — chiunque cloni può fare checkout.

---

### Task 5: Verifica manuale completa (criteri di accettazione)

**Files:**
- Modify (temporaneo, da NON committare): `src/app/wm-layer-map/wm-layer-map.component.html` (binding di smoke test)

**Interfaces:**
- Consumes: tutto quanto costruito nei Task 1-4.
- Produces: checklist di accettazione dell'overview spuntata; esito registrato in `notes.md` (fase notes del workflow wm-plan).

- [ ] **Step 1: Scenari funzionali in demo**

Run: `nvm use && npm run start:demo` — su una traccia con related POI (shard `camminiditalia`, app 1, default demo):

1. Selezione da click sul marker → evidenziazione + fitView + pannello POI aperto
2. Selezione da store/URL: seleziona un related POI, ricarica lo stato (o usa i controlli demo) → il POI risulta selezionato
3. Next/prev dal pannello → navigazione circolare, un solo POI evidenziato per volta
4. Deselezione dal pannello (dismiss) → il marker torna normale e **non riappare** (attendere >1s)
5. Click su zona vuota della mappa → deselezione, il POI **non riappare**
6. Cambio traccia con POI selezionato → reset pulito (nessun marker orfano, pannello chiuso); ri-selezione della stessa traccia → marker identici, nessun doppione
7. POI con foto (`show_image_on_map`/`108x137`) → marker circolare con foto; POI senza foto → icona SVG colorata; confronto **side-by-side con wm-webapp** a parità di shard/traccia (colori, dimensioni, evidenziazione selezione)

- [ ] **Step 2: Check memoria (layer + listener + subscription)**

In console del browser sulla demo, con la mappa a regime:

```js
const map = document.querySelector('wm-map') ? undefined : window;
// contare i layer prima/dopo:
// (usare l'istanza OL esposta: in demo, da Angular DevTools o breakpoint su WmMapComponent)
// mapCmp.map.getLayers().getLength()
```

Procedura: annota `map.getLayers().getLength()`; esegui ~20 cicli selezione/deselezione + 5 cambi traccia; rileggi il conteggio.
Expected: conteggio layer invariato (i 2 layer della direttiva vengono creati una sola volta); nessun warning "No directive or onClick method found" in console; nessuna crescita di listener (verificabile con `mapCmp.map.getListeners?.('click')?.length` stabile, o profilo memoria DevTools senza detached listeners in crescita).

- [ ] **Step 3: Smoke test della superficie non usata dal widget (binding temporanei)**

Aggiungi **temporaneamente** in `wm-layer-map.component.html` dopo la riga `wmelMapTrackRelatedPois`:

```html
    [wmMapPoisFilters]="['poi_type_poi']"
    [wmMapReletedPoisDisableClusterLayer]="false"
    [wmMapTrackRelatedPoisAlertPoiRadius]="100"
    (related-poi-click)="onSmokeRelatedPoiClick($event)"
```

e temporaneamente nel componente:

```typescript
  onSmokeRelatedPoiClick(id: number): void {
    console.log('[smoke] related-poi-click', id);
  }
```

Verifiche (in demo):
1. `wmMapPoisFilters` con un identifier reale dello shard → restano visibili solo i related POI di quel tipo; con `[]` → tutti visibili
2. `wmMapReletedPoisDisableClusterLayer` a `true` (modifica live) → marker nascosti; a `false` → visibili
3. Click su un marker → console mostra `[smoke] related-poi-click <id>`
4. `next`: da console/DevTools imposta l'input (o binding temporaneo `[next]="resetSelectedPoi$|async"`) → l'evidenziazione selezione scompare
5. Nearest POI: con binding temporaneo `[wmMapPositioncurrentLocation]="{latitude: <lat di un POI>, longitude: <lon>} "` (usa coordinate di un related POI reale) → il marker più vicino si ingrandisce (scala 1.2) e l'output emette

Al termine: **rimuovi tutti i binding e il metodo temporanei** e verifica con `git diff --stat` che il working tree sia pulito rispetto ai commit dei Task 1-4.

- [ ] **Step 4: Build elements + verifica cross-origin**

```bash
nvm use
npm run build:wm-layer-map
node scripts/sync-test-page.js wm-layer-map
```

Poi servi la build e la pagina di test da **origin diversi** (fallback CORS pipeline foto + Shadow DOM):

```bash
# terminale 1: bundle su una porta
python3 -m http.server 8081 --directory dist/wm-layer-map
# terminale 2: pagina di test su un'altra porta (embed cross-origin)
python3 -m http.server 8082 --directory test/wm-layer-map
```

Apri `http://localhost:8082` (adattando i tag `<script>/<link>` se `sync-test-page.js` li ha puntati in locale). Expected: widget funzionante dentro Shadow DOM, marker foto renderizzati o degradati a icona senza errori in console; selezione/deselezione come in demo.

- [ ] **Step 5: Commit di eventuali fix emersi (istruzione per il developer — eseguire solo dopo conferma esplicita)**

```bash
git add -A src/app/wm-layer-map
git commit -m "fix(riscrittura-direttiva-track-related-pois): address manual verification findings"
```

---

## Self-review (eseguita in fase di scrittura piano)

- **Copertura spec**: firma completa (Task 2: tutti i 9 input, 3 output, poiNext/poiPrev/currentRelatedPoi$); rendering tre vie + riuso feature globali (Task 1); dispatcher centrale + empty click (Task 2); unico scrittore (Task 2 + Task 3); reset su cambio traccia con guardia id-uguale-riferimento-nuovo (Task 2); filtri con fallback taxonomy (Task 2); nearest POI (Task 2); binding morti + subject orfani (Task 3); repoint submodule (Task 4); criteri di accettazione + smoke test + cross-origin (Task 5).
- **Divergenze consapevoli dalla legacy** (documentare in notes.md): ramo `else if (svgIcon)` omesso perché irraggiungibile; `related-poi` non ri-emesso a ogni selezione da binding (solo click/next/prev/deselezione — il widget è l'unico consumer e usa l'evento solo per aggiornare l'URL); nessun `debounceTime(500)` (la selezione pendente aspetta `_markersReady$`, non un timer).
- **Coerenza tipi**: `createRelatedPoiMarker` (Task 1) usata in `_buildMarkers`/`_applySelection` (Task 2) con la stessa firma; `relatedPoisDirective` (Task 3) usa solo `poiNext()`/`poiPrev()` dichiarati nel Task 2.
