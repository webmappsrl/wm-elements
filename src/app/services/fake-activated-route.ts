import {of} from 'rxjs';

/**
 * map-core's WmMapComponent injects a real ActivatedRoute to read
 * queryParams (used only to check whether a `track` param is already
 * present before auto-fitting the bbox on mount). We never configure
 * Angular's Router — the widget must not read or write the host page's
 * URL — so we provide this minimal stand-in instead. `queryParams` always
 * emits an empty object, which map-core treats as "no track selected yet",
 * matching the widget's actual initial state.
 */
export const fakeActivatedRoute: any = {
  queryParams: of({}),
};
