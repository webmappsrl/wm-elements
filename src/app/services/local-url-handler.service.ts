import {Injectable} from '@angular/core';
import {Store} from '@ngrx/store';
import {BehaviorSubject} from 'rxjs';
import {Params} from '@angular/router';
import {
  currentEcLayerId,
  currentEcTrackId,
  currentEcPoiId,
  currentEcRelatedPoiId,
} from '@wm-core/store/features/ec/ec.actions';
import {closeUgc, closeDownloads} from '@wm-core/store/user-activity/user-activity.action';

const EMPTY_PARAMS: Params = {
  track: undefined,
  poi: undefined,
  ugc_track: undefined,
  ugc_poi: undefined,
  ec_related_poi: undefined,
  gallery_index: undefined,
  layer: undefined,
};

/**
 * Drop-in replacement for wm-core's UrlHandlerService that never touches the
 * real Router/ActivatedRoute or window.location. Reused components (e.g.
 * wm-track-related-poi, wm-track-properties) call the same public methods;
 * here they resolve to an in-memory params object instead of a browser
 * navigation, so selection state never leaks into the host page URL.
 */
@Injectable()
export class LocalUrlHandlerService {
  private _params$: BehaviorSubject<Params> = new BehaviorSubject<Params>({});

  constructor(private _store: Store) {}

  getCurrentQueryParams(): Params {
    return this._params$.value;
  }

  updateURL(queryParams: Params, _routes: string[] = []): void {
    const oldParams = {...EMPTY_PARAMS, ...this._params$.value};
    const newParams = {...oldParams, ...queryParams};

    // Stessa mutua esclusione del vero UrlHandlerService.updateURL
    // (wm-core, url-handler.service.ts): track/poi/ugc_track/ugc_poi si
    // escludono a vicenda — impostarne uno azzera gli altri tre. Senza
    // questa esclusione (il primo shim faceva un merge ingenuo), un `poi`
    // selezionato restava nei params per sempre anche dopo aver aperto
    // una traccia: `wmMapPoisPoi` non tornava mai null, la direttiva
    // pois di map-core non deselezionava mai il marker, e sulla mappa
    // restavano evidenziati due POI contemporaneamente (il vecchio poi
    // generale + il related-poi corrente della traccia).
    const excludeFields = ['track', 'poi', 'ugc_track', 'ugc_poi'];
    for (const field of excludeFields) {
      if (queryParams[field] != null) {
        excludeFields
          .filter(f => f !== field)
          .forEach(fieldToRemove => {
            newParams[fieldToRemove] = undefined;
          });
      }
    }

    // POI generale e related-poi della traccia sono selezioni alternative:
    // impostarne uno azzera l'altro (coerente con geobox-map, dove
    // `mergedPoi$` deseleziona il related quando arriva un poi generale).
    // `ec_related_poi` non entra nel gruppo track/poi/ugc_* perché può
    // coesistere con `track` (i related-poi appartengono alla traccia
    // corrente), ma non con `poi`.
    if (queryParams['poi'] != null) {
      newParams['ec_related_poi'] = undefined;
    }
    if (queryParams['ec_related_poi'] != null) {
      newParams['poi'] = undefined;
    }
    if (queryParams['track'] != null) {
      newParams['ec_related_poi'] = undefined;
    }

    if (JSON.stringify(newParams) !== JSON.stringify(oldParams)) {
      this._params$.next(newParams);
      this._dispatchFromParams(newParams);
    }
  }

  changeURL(_route: string, queryParams: Params = this.getCurrentQueryParams()): void {
    this.updateURL(queryParams);
  }

  resetURL(): void {
    this._store.dispatch(closeUgc());
    this._store.dispatch(closeDownloads());
    this._params$.next({...EMPTY_PARAMS});
    this._dispatchFromParams(EMPTY_PARAMS);
  }

  setPoi(id: string | number): void {
    this.updateURL({poi: id ? id : undefined, ugc_poi: undefined});
  }

  setTrack(id: string | number): void {
    this.updateURL({track: id ? id : undefined});
  }

  removeLatest(): boolean {
    const p = this.getCurrentQueryParams();
    if (p.gallery_index != null) {
      this.updateURL({gallery_index: undefined});
      return false;
    } else if (p.ec_related_poi != null) {
      this.updateURL({ec_related_poi: undefined});
      return false;
    } else if (p.layer != null && (p.poi != null || p.track != null)) {
      this.updateURL({poi: undefined, track: undefined});
      return false;
    } else if (p.ugc_track != null || p.ugc_poi != null) {
      this.updateURL({ugc_track: undefined, ugc_poi: undefined});
      return false;
    } else {
      this.resetURL();
      return true;
    }
  }

  private _dispatchFromParams(params: Params): void {
    this._store.dispatch(currentEcLayerId({currentEcLayerId: params.layer ?? null}));
    this._store.dispatch(currentEcTrackId({currentEcTrackId: params.track ?? null}));
    this._store.dispatch(currentEcPoiId({currentEcPoiId: params.poi ?? null}));
    this._store.dispatch(
      currentEcRelatedPoiId({currentRelatedPoiId: params.ec_related_poi ?? null}),
    );
  }
}
