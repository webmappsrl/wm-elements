import {Directive, Host} from '@angular/core';
import View from 'ol/View';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {extentFromLonLat} from '@map-core/utils';

/**
 * Sostituisce la View OL corrente con una vincolata al bbox del layer:
 * centraggio istantaneo (nessuna animazione) e blocco del dezoom oltre
 * il livello del fit iniziale. Il pan resta vincolato al bbox tramite
 * `extent` + `constrainOnlyCenter`. Il maxZoom resta invariato (zoom-in
 * libero).
 */
@Directive({
  selector: '[wmLayerMap]',
  standalone: true,
})
export class WmLayerMapDirective {
  constructor(@Host() private _mapCmp: WmMapComponent) {}

  apply(bbox: [number, number, number, number], maxZoom: number, padding: number[]): void {
    if (this._mapCmp.map == null || bbox == null) {
      return;
    }

    const extent = extentFromLonLat(bbox);

    const view = new View({
      projection: 'EPSG:3857',
      extent,
      constrainOnlyCenter: true,
      showFullExtent: true,
      maxZoom,
    });

    this._mapCmp.map.setView(view);

    view.fit(extent, {duration: 0, padding, nearest: true});
    view.setMinZoom(view.getZoom());
  }
}
