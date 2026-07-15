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
import {createRelatedPoiMarker} from './ol';

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
  private _relatedPois: WmFeature<Point>[] = [];
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
      this._poisLayer = createLayer(this._poisLayer, RELATED_POIS_ZINDEX);
      this.mapCmp.map.addLayer(this._poisLayer);
      this.mapCmp.registerDirective(this._poisLayer['ol_uid'], this);
    }
    if (this._selectedLayer == null) {
      this._selectedLayer = createLayer(this._selectedLayer, SELECTED_RELATED_POI_ZINDEX);
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
