import {Directive, Host} from '@angular/core';
import View from 'ol/View';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {extentFromLonLat} from '@map-core/utils';

const MAP_READY_POLL_INTERVAL_MS = 50;
const MAP_READY_POLL_MAX_ATTEMPTS = 40; // ~2s

/**
 * Sostituisce la View OL corrente con una vincolata al bbox del layer:
 * centraggio istantaneo (nessuna animazione) e blocco del dezoom oltre
 * il livello del fit iniziale. Il pan resta vincolato al bbox tramite
 * `extent` con `constrainOnlyCenter: false` (vincola l'intero viewport
 * visibile, non solo il punto centrale — con `constrainOnlyCenter: true`
 * il centro resta dentro il bbox ma i bordi della vista possono comunque
 * mostrare area oltre il bbox per metà della larghezza/altezza del
 * viewport). Il maxZoom resta invariato (zoom-in libero).
 */
@Directive({
  selector: '[wmLayerMap]',
  standalone: true,
})
export class WmLayerMapDirective {
  constructor(@Host() private _mapCmp: WmMapComponent) {}

  apply(bbox: [number, number, number, number], maxZoom: number, padding: number[]): void {
    if (bbox == null) {
      return;
    }
    this._applyWhenMapReady(bbox, maxZoom, padding, 0);
  }

  // `WmMapComponent.map` (l'istanza OL) viene creata da map-core solo dopo
  // un delay interno successivo al caricamento della config (vedi
  // map.component.ts, ngAfterViewInit: `wmMapConf$.pipe(..., delay(250))`),
  // quindi al momento in cui questo metodo viene chiamato (subito dopo che
  // anche la nostra config/layer sono disponibili) `map` può non esistere
  // ancora. Si effettua un retry limitato invece di dipendere da quel
  // timing interno del submodule.
  private _applyWhenMapReady(
    bbox: [number, number, number, number],
    maxZoom: number,
    padding: number[],
    attempt: number,
  ): void {
    if (this._mapCmp.map == null) {
      if (attempt >= MAP_READY_POLL_MAX_ATTEMPTS) {
        return;
      }
      setTimeout(
        () => this._applyWhenMapReady(bbox, maxZoom, padding, attempt + 1),
        MAP_READY_POLL_INTERVAL_MS,
      );
      return;
    }

    const extent = extentFromLonLat(bbox);

    const view = new View({
      projection: 'EPSG:3857',
      extent,
      constrainOnlyCenter: false,
      showFullExtent: true,
      maxZoom,
    });

    this._mapCmp.map.setView(view);

    view.fit(extent, {duration: 0, padding, nearest: true});
    view.setMinZoom(view.getZoom());
  }
}
