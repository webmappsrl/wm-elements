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
    const merged = {...EMPTY_PARAMS, ...this._params$.value, ...queryParams};
    this._params$.next(merged);
    this._dispatchFromParams(merged);
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
