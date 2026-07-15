import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
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
  confTHEMEVariables,
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
import {BehaviorSubject, combineLatest, forkJoin, Observable, of, ReplaySubject} from 'rxjs';
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
import {LangService} from '@wm-core/localization/lang.service';
import {confAPP} from '@wm-core/store/conf/conf.selector';
import {ILAYER} from '@wm-core/types/config';
import {WidgetBrandingService, WidgetPlatform} from '../services/widget-branding.service';
import {WmLayerMapDirective} from './directives/wm-layer-map.directive';
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
  imports: [CommonModule, WmCoreModule, IonicModule, WmLayerMapDirective],
  templateUrl: './wm-layer-map.component.html',
  styleUrl: './wm-layer-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class WmLayerMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() shard!: string;
  @Input('app-id') appId!: string;
  @Input('layer-id') layerId!: string;
  @Input('cta-label') ctaLabelAttr?: string;
  @Input('cta-url') ctaUrlAttr?: string;
  @Input('app-icon-url') appIconUrlAttr?: string;
  @Input('ios-store-url') iosStoreUrlAttr?: string;
  @Input('android-store-url') androidStoreUrlAttr?: string;
  @Input('hide-cta') hideCtaAttr?: string;
  @Input() lang?: string;

  @Output() ready = new EventEmitter<void>();
  @Output() error = new EventEmitter<{message: string}>();
  @Output('track-selected') trackSelected = new EventEmitter<{trackId: number}>();

  @ViewChild(WmMapTrackRelatedPoisDirective)
  WmMapTrackRelatedPoisDirective: WmMapTrackRelatedPoisDirective;

  @ViewChild(WmLayerMapDirective) private _wmLayerMapDirective: WmLayerMapDirective;

  // Se lo store NgRx ha già `isConfLoaded === true` al momento della
  // subscribe (es. istanza riavviata nella demo, store condiviso tra
  // mount successivi), la pipeline sotto emette in modo sincrono dentro
  // ngOnInit — prima che Angular abbia risolto il @ViewChild sopra
  // (garantito solo a partire da ngAfterViewInit). Questo gate impedisce
  // di leggere `_wmLayerMapDirective` prima che sia valorizzato.
  private _afterViewInit$ = new ReplaySubject<void>(1);

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
          map((tracks: WmFeature<any>[]) => {
            const allPois = tracks.flatMap(
              t => (t?.properties?.related_pois as WmFeature<Point>[]) ?? [],
            );
            // Adjacent tappe of the same cammino can share a junction POI —
            // present in both tracks' own related_pois. Deduplicated by id,
            // otherwise map-core's pois.directive throws ("feature already
            // added to source") trying to add the same POI twice to the same
            // OL vector source, aborting the whole map render.
            const seen = new Set<number>();
            return allPois.filter(f => {
              const id = f?.properties?.id;
              if (id == null || seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          }),
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

  confAPP$ = this._store.select(confAPP);
  platform: WidgetPlatform;
  appIconFallbackSrc = this._brandingSvc.APP_ICON_FALLBACK_SRC;
  appStoreBadgeSrc = this._brandingSvc.APP_STORE_BADGE_SRC;
  googlePlayBadgeSrc = this._brandingSvc.GOOGLE_PLAY_BADGE_SRC;

  ctaLabel$: Observable<string> = this.confAPP$.pipe(
    map(app => this.ctaLabelAttr ?? app?.name ?? 'Webmapp'),
  );

  // Calcolate in ngOnInit (non come inizializzatori di campo): appId/layerId
  // sono @Input() e Angular li valorizza solo dopo la costruzione
  // dell'istanza, durante il primo ciclo di change detection — usarli qui
  // in un inizializzatore di campo li leggerebbe ancora `undefined`.
  ctaUrl: string;
  ctaIconUrl: string | null;

  iosStoreUrl$: Observable<string | null> = this.confAPP$.pipe(
    map(app => {
      if (this.platform != null && this.platform !== 'ios') {
        return null;
      }
      return this.iosStoreUrlAttr ?? app?.iosStore ?? null;
    }),
  );

  androidStoreUrl$: Observable<string | null> = this.confAPP$.pipe(
    map(app => {
      if (this.platform != null && this.platform !== 'android') {
        return null;
      }
      return this.androidStoreUrlAttr ?? app?.androidStore ?? null;
    }),
  );

  get hideCta(): boolean {
    return this.hideCtaAttr != null && this.hideCtaAttr !== 'false';
  }

  isFullscreen = false;
  private _onFullscreenChange = (): void => {
    this.isFullscreen = document.fullscreenElement === this._elementRef.nativeElement;
    this._cdr.markForCheck();
  };

  constructor(
    private _store: Store,
    private _actions$: Actions,
    private _urlHandlerSvc: UrlHandlerService,
    private _environmentSvc: EnvironmentService,
    private _ecSvc: EcService,
    private _brandingSvc: WidgetBrandingService,
    private _langSvc: LangService,
    private _elementRef: ElementRef<HTMLElement>,
    private _cdr: ChangeDetectorRef,
  ) {
    this.platform = this._brandingSvc.detectPlatform();
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
    this.ctaUrl = this.ctaUrlAttr ?? this._brandingSvc.buildCtaUrl(this.appId, this.layerId);
    this.ctaIconUrl = this.appIconUrlAttr ?? this._brandingSvc.buildAppIconUrl(this.appId);

    // Fullscreen custom: a differenza del controllo OL nativo (che mette in
    // fullscreen solo il contenitore interno della mappa, `map.getTargetElement()`,
    // escludendo CTA/badge/pannello), qui si mette in fullscreen l'intero
    // host element del widget — stesso comportamento del vecchio widget
    // vanilla JS, dove tutta la UI resta visibile durante il fullscreen.
    document.addEventListener('fullscreenchange', this._onFullscreenChange);

    // wm-webapp applica le CSS custom properties del tema (--wm-color-*,
    // --wm-font-*, usate da componenti riusati di wm-core/map-core come
    // l'attribution della mappa) sul `:root` globale della pagina
    // (app.component.ts, codice applicativo di wm-webapp, non del
    // submodule wm-core). Il widget non ha un equivalente e viene
    // embeddato in Shadow DOM su pagine di terzi: applicarle su
    // `document.documentElement` inquinerebbe lo stato globale della
    // pagina host, quindi le applichiamo sull'host element del widget
    // stesso — le CSS custom properties attraversano il confine dello
    // Shadow DOM per ereditarietà, restando invisibili fuori dal widget.
    this._store
      .select(confTHEMEVariables)
      .pipe(
        filter(vars => vars != null),
        take(1),
      )
      .subscribe(vars => {
        Object.keys(vars).forEach(name => {
          this._elementRef.nativeElement.style.setProperty(name, `${vars[name]}`);
        });
      });

    const resolvedLang = this.lang ?? document.documentElement.lang ?? 'it';
    // LangService.use() scrive anche su localStorage('wm-lang'), condiviso
    // da tutte le istanze del widget sulla stessa pagina: se due
    // <wm-layer-map> con `lang` diversi sono embeddati sulla stessa pagina,
    // l'ultimo a inizializzarsi vince per entrambi. Comportamento
    // preesistente di wm-core (LangService), non risolvibile qui senza
    // toccare il submodule — accettato come rischio noto, non peggiora
    // nulla rispetto a oggi (il widget attuale non imposta affatto `lang`).
    this._langSvc.isInit$
      .pipe(
        filter(ready => ready === true),
        take(1),
      )
      .subscribe(() => this._langSvc.use(resolvedLang));

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
        ).subscribe((layers: ILAYER[]) => {
          const layer = layers.find(l => +l.id === +this.layerId);
          if (layer == null) {
            this.error.emit({message: `layer ${this.layerId} not found`});
            return;
          }
          if (layer.bbox != null) {
            combineLatest([this.confMap$, this.mapPadding$, this._afterViewInit$])
              .pipe(take(1))
              .subscribe(([conf, currentPadding]) => {
                this._wmLayerMapDirective.apply(
                  layer.bbox,
                  conf.maxZoom,
                  currentPadding ?? initPadding,
                );
              });
          }
          this._urlHandlerSvc.updateURL({layer: this.layerId});
          this.ready.emit();
        });
      });
  }

  ngAfterViewInit(): void {
    this._afterViewInit$.next();
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement === this._elementRef.nativeElement) {
      document.exitFullscreen();
    } else {
      this._elementRef.nativeElement.requestFullscreen();
    }
  }

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

  onCtaIconError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src !== this.appIconFallbackSrc) {
      img.src = this.appIconFallbackSrc;
    }
  }
}
