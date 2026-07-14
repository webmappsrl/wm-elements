import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {padding as actionPadding} from '@map-core/store/map-core.actions';
import {padding} from '@map-core/store/map-core.selector';
import {Store} from '@ngrx/store';
import {loadConf} from '@wm-core/store/conf/conf.actions';
import {
  confJIDOUPDATETIME,
  confMAP,
  confMAPLAYERS,
  confOPTIONSShowFeaturesInViewport,
  confZoomFeaturesInViewport,
  confGeohubId,
  isConfLoaded,
} from '@wm-core/store/conf/conf.selector';
import {
  currentEcPoiId,
  currentEcRelatedPoi,
  currentEcRelatedPoiId,
  currentEcTrack,
  ecTracks as ecTracksSelector,
} from '@wm-core/store/features/ec/ec.selector';
import {EcService} from '@wm-core/store/features/ec/ec.service';
import {poi, showFeaturesInViewport, track} from '@wm-core/store/features/features.selector';
import {
  resetTrackFilters,
  startLoader,
  stopLoader,
  toggleTrackFilter,
  updateTrackFilter,
  wmMapFeaturesInViewport,
} from '@wm-core/store/user-activity/user-activity.action';
import {ICONS} from '@wm-types/config';
import {loadIcons} from '@wm-core/store/icons/icons.actions';
import {icons} from '@wm-core/store/icons/icons.selector';
import {BehaviorSubject, combineLatest, forkJoin, Observable, of} from 'rxjs';
import {filter, map, switchMap, take} from 'rxjs/operators';
import {IDATALAYER} from '@map-core/types/layer';
import {
  chartHoverElements,
  ecLayer,
  loading,
  mapFilters,
} from '@wm-core/store/user-activity/user-activity.selector';
import {WmFeature} from '@wm-types/feature';
import {Point} from 'geojson';
import {WmMapTrackRelatedPoisDirective} from '@map-core/directives';
import {UrlHandlerService} from '@wm-core/services/url-handler.service';
import {Actions, ofType} from '@ngrx/effects';
import {WmSlopeChartHoverElements} from '@wm-types/slope-chart';
import {EnvironmentService} from '@wm-core/services/environment.service';
import {FeatureLike} from 'ol/Feature';
import {ZoomFeaturesInViewport} from '@wm-types/config';
import {WmCoreModule} from '@wm-core/wm-core.module';
import {CommonModule} from '@angular/common';
import {IonicModule} from '@ionic/angular';

const initPadding = [10, 10, 10, 10];
const maxWidth = 600;

/**
 * Copied from wm-core's WmGeoboxMapComponent (geobox-map/geobox-map.component.ts)
 * and trimmed down to the widget's scope: map + layer tracks + POIs +
 * track-related POIs. Everything requiring editing/UGC/geolocation/offline
 * download/hitmap has been removed on purpose — the widget is read-only and
 * embedded on third-party pages. Property names and store selectors kept
 * identical to the original where still applicable, to stay a straightforward
 * diff against wm-core rather than a from-scratch reimplementation.
 */
@Component({
  selector: 'app-wm-layer-map-root',
  standalone: true,
  imports: [CommonModule, WmCoreModule, IonicModule],
  templateUrl: './wm-layer-map.component.html',
  styleUrl: './wm-layer-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class WmLayerMapComponent implements OnInit, OnDestroy {
  @Input() shard!: string;
  @Input('app-id') appId!: string;
  @Input('layer-id') layerId!: string;

  @Output() ready = new EventEmitter<void>();
  @Output() error = new EventEmitter<{message: string}>();
  @Output('track-selected') trackSelected = new EventEmitter<{trackId: number}>();

  @ViewChild(WmMapTrackRelatedPoisDirective)
  WmMapTrackRelatedPoisDirective: WmMapTrackRelatedPoisDirective;

  apiElasticState$: Observable<any> = this._store.select(mapFilters);
  confJIDOUPDATETIME$: Observable<any> = this._store.select(confJIDOUPDATETIME);
  confMap$: Observable<any> = this._store.select(confMAP);
  confOPTIONSShowFeaturesInViewport$: Observable<boolean> = this._store.select(
    confOPTIONSShowFeaturesInViewport,
  );
  currentEcPoiId$ = this._store.select(currentEcPoiId);
  currentLayer$ = this._store.select(ecLayer);
  currentPoi$ = this._store.select(poi);
  ecTrack$ = this._store.select(currentEcTrack);
  currentPoiNextID$: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
  currentPoiPrevID$: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
  currentRelatedPoi$ = this._store.select(currentEcRelatedPoi);
  currentRelatedPoiID$ = this._store.select(currentEcRelatedPoiId);
  dataLayerUrls$: Observable<IDATALAYER>;
  geohubId$ = this._store.select(confGeohubId);
  icons$: Observable<ICONS> = this._store.select(icons);
  // POIs of the whole layer (all its tappe/tracks, not just the one the user
  // clicked): `ecTracks` is populated automatically by wm-core's own
  // `triggerQueryOnInput$` effect (user-activity.effects.ts) as soon as the
  // layer is set — the same ES `&layer=<id>` query wm-webapp uses to list a
  // cammino's tappe. Each hit's own `related_pois` (embedded server-side,
  // fetched via the existing `EcService.getEcTrack`, same method used
  // elsewhere for the clicked track) are combined here — no invented fetch
  // logic, no global ecPois/taxonomy filter (see notes.md).
  layerPois$: Observable<WmFeature<Point>[]> = combineLatest([
    (this._store.select(ecTracksSelector) as Observable<any[]>).pipe(
      switchMap((hits: any[]) => {
        if (hits == null || hits.length === 0) {
          return of([] as WmFeature<Point>[]);
        }
        return forkJoin(hits.map(hit => this._ecSvc.getEcTrack(hit.id))).pipe(
          map((tracks: WmFeature<any>[]) =>
            tracks.flatMap(t => (t?.properties?.related_pois as WmFeature<Point>[]) ?? []),
          ),
        );
      }),
    ),
    this.icons$,
  ]).pipe(
    // Same svgIcon enrichment `ecPois` (ec.selector.ts) applies to the global
    // POI feed — reused here since related_pois arrive raw, without it.
    map(([pois, icons]) =>
      pois.map((f: any) => {
        if (f?.properties?.taxonomy?.poi_type != null) {
          const iconName = f.properties.taxonomy.poi_type.icon_name ?? '';
          const svgIcon = icons?.[iconName] ?? f.properties.taxonomy.poi_type.icon ?? '';
          return {...f, properties: {...f.properties, svgIcon}};
        }
        return f;
      }),
    ),
  );
  loading$: Observable<boolean> = this._store.select(loading);
  mapPadding$ = this._store.select(padding);
  refreshLayer$: Observable<any>;
  resetSelectedPoi$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  showFeaturesInViewport$: Observable<boolean> = this._store.select(showFeaturesInViewport);
  track$ = this._store.select(track);
  trackColor$: BehaviorSubject<string> = new BehaviorSubject<string>('#caaf15');
  trackElevationChartHoverElements$: Observable<WmSlopeChartHoverElements> =
    this._store.select(chartHoverElements);
  zoomFeaturesInViewport$: Observable<ZoomFeaturesInViewport> = this._store.select(
    confZoomFeaturesInViewport,
  );

  constructor(
    private _store: Store,
    private _actions$: Actions,
    private _urlHandlerSvc: UrlHandlerService,
    private _environmentSvc: EnvironmentService,
    private _ecSvc: EcService,
  ) {
    this.refreshLayer$ = this._actions$.pipe(
      ofType(updateTrackFilter, toggleTrackFilter, resetTrackFilters),
    );
    if (window.innerWidth < maxWidth) {
      this._store.dispatch(actionPadding({padding: initPadding}));
    }
    this.dataLayerUrls$ = this.geohubId$.pipe(
      filter(g => g != null),
      map(
        _ =>
          ({
            low: this._environmentSvc.pbfUrl,
            high: this._environmentSvc.pbfUrl,
          } as IDATALAYER),
      ),
    );
  }

  ngOnInit(): void {
    // Same actions ConfEffects/EcEffects/IconsEffects already listen for in
    // wm-core: loadConf triggers ConfService.getConf() (uses
    // EnvironmentService.confUrl, already resolved for our shard/app-id),
    // loadIcons fetches the icon set used by wmTrackRelatedPoiIcons. Once
    // conf is loaded, selecting the layer via the URL handler (not the real
    // browser URL — see LocalUrlHandlerService) triggers
    // ConfEffects.updateLayer$ (resolves the layer from confMAP.layers,
    // dispatches setLayer) which in turn updates the `ecLayer` selector —
    // already watched by wm-core's own `triggerQueryOnInput$` effect
    // (user-activity.effects.ts), which automatically dispatches `ecTracks`
    // with an ES `&layer=<id>` filter and populates the `ecTracks` selector
    // with the layer's own tracks (its "tappe"). `layerPois$` above combines
    // their related_pois — the same mechanism wm-webapp uses to list/show a
    // cammino's POIs, not a client-side taxonomy filter (removed — see
    // docs/features/8252-wm-layer-map-angular/notes.md).
    this._store.dispatch(loadConf());
    this._store.dispatch(loadIcons());

    this._store
      .select(isConfLoaded)
      .pipe(filter(loaded => loaded === true), take(1))
      .subscribe(() => {
        this._store.select(confMAPLAYERS).pipe(
          filter(layers => layers != null),
          take(1),
        ).subscribe(layers => {
          const layerExists = layers.some(l => +l.id === +this.layerId);
          if (!layerExists) {
            this.error.emit({message: `layer ${this.layerId} not found`});
            return;
          }
          this._urlHandlerSvc.updateURL({layer: this.layerId});
          this.ready.emit();
        });
      });
  }

  ngOnDestroy(): void {}

  featuresInViewport(features: FeatureLike[]): void {
    const featureIds = features
      .map(feature => feature.getProperties()?.id)
      .filter(id => id != null);
    this._store.dispatch(wmMapFeaturesInViewport({featureIds}));
  }

  setCurrentRelatedPoi(feature: number | WmFeature<Point> | null): void {
    if (feature == null) {
      return;
    } else if (typeof feature === 'number') {
      this._urlHandlerSvc.updateURL({ec_related_poi: feature});
      this.WmMapTrackRelatedPoisDirective.setPoi = feature;
    } else if (feature.properties != null && feature.properties.id != null) {
      const id = feature.properties.id;
      this._urlHandlerSvc.updateURL({ec_related_poi: id});
    }
  }

  unselectPoi(): void {
    this._urlHandlerSvc.updateURL({poi: undefined, ec_related_poi: undefined});
  }

  setPoi(poi: WmFeature<Point>): void {
    const id = poi?.properties?.id ?? null;
    this._urlHandlerSvc.updateURL({poi: id ? +id : undefined});
  }

  setLoader(event: string): void {
    switch (event) {
      case 'rendering:pois_start':
        this._store.dispatch(startLoader({identifier: 'pois'}));
        break;
      case 'rendering:layer_start':
        this._store.dispatch(startLoader({identifier: 'layer'}));
        break;
      case 'rendering:layer_done':
        this._store.dispatch(stopLoader({identifier: 'layer'}));
        break;
      case 'rendering:pois_done':
        this._store.dispatch(stopLoader({identifier: 'pois'}));
        break;
    }
  }

  updateEcTrack(trackId: number | undefined = undefined): void {
    this._urlHandlerSvc.updateURL({track: trackId});
    if (trackId != null) {
      this.trackSelected.emit({trackId});
    }
  }
}
