import {Directive, Host} from '@angular/core';
import View from 'ol/View';
import {Extent} from 'ol/extent';
import {WmMapComponent} from '@map-core/components/map/map.component';
import {extentFromLonLat} from '@map-core/utils';

const MAP_READY_POLL_INTERVAL_MS = 50;
const MAP_READY_POLL_MAX_ATTEMPTS = 40; // ~2s
const BBOX_MARGIN_RATIO = 0.1;

// Allarga l'extent (EPSG:3857) del 10% per lato: senza margine i punti di
// partenza/arrivo del cammino restano appiccicati al bordo del viewport
// (sia nel fit iniziale sia nel vincolo di pan), difficili da cliccare.
function bufferExtent(extent: Extent): Extent {
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];
  const bufferX = width * BBOX_MARGIN_RATIO;
  const bufferY = height * BBOX_MARGIN_RATIO;
  return [extent[0] - bufferX, extent[1] - bufferY, extent[2] + bufferX, extent[3] + bufferY];
}

/**
 * Sostituisce la View OL corrente con una vincolata al bbox del layer
 * (allargato del 10% per lato, vedi `bufferExtent`, per dare margine
 * cliccabile ai punti di partenza/arrivo): centraggio istantaneo (nessuna
 * animazione) e un dezoom limitato a un livello sotto il fit iniziale
 * (mai sotto il minZoom globale di config). Il pan resta vincolato al
 * bbox allargato tramite `extent` con `constrainOnlyCenter: false`
 * (vincola l'intero viewport visibile, non solo il punto centrale — con
 * `constrainOnlyCenter: true` il centro resta dentro il bbox ma i bordi
 * della vista possono comunque mostrare area oltre il bbox per metà della
 * larghezza/altezza del viewport). Il maxZoom resta invariato (zoom-in
 * libero).
 */
@Directive({
  selector: '[wmLayerMap]',
  standalone: true,
})
export class WmLayerMapDirective {
  constructor(@Host() private _mapCmp: WmMapComponent) {}

  apply(
    bbox: [number, number, number, number],
    maxZoom: number,
    padding: number[],
    confMinZoom: number,
  ): void {
    if (bbox == null) {
      return;
    }
    this._applyWhenMapReady(bbox, maxZoom, padding, confMinZoom, 0);
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
    confMinZoom: number,
    attempt: number,
  ): void {
    if (this._mapCmp.map == null) {
      if (attempt >= MAP_READY_POLL_MAX_ATTEMPTS) {
        return;
      }
      setTimeout(
        () => this._applyWhenMapReady(bbox, maxZoom, padding, confMinZoom, attempt + 1),
        MAP_READY_POLL_INTERVAL_MS,
      );
      return;
    }

    const extent = bufferExtent(extentFromLonLat(bbox));

    const view = new View({
      projection: 'EPSG:3857',
      extent,
      constrainOnlyCenter: false,
      showFullExtent: true,
      maxZoom,
    });

    this._mapCmp.map.setView(view);
    (this._mapCmp as any)._view = view;

    view.fit(extent, {duration: 0, padding, nearest: true});
    const fitZoom = view.getZoom() ?? confMinZoom;
    view.setMinZoom(Math.max(fitZoom - 1, confMinZoom));
  }
}
