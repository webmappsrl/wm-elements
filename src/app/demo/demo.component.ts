import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {WmLayerMapComponent} from '../wm-layer-map/wm-layer-map.component';

const WIDGET_LOADER_URL =
  'https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/wm-layer-map/wm-layer-map.js';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, WmLayerMapComponent],
  templateUrl: './demo.component.html',
})
export class DemoComponent {
  shard = 'camminiditalia';
  appId = '1';
  layerId = '130';
  lang = 'it';
  hideCta = false;

  // Il widget legge i propri @Input() una sola volta in ngOnInit (stesso
  // comportamento del custom element reale, pensato per essere embeddato una
  // volta sola con attributi statici — non per reagire a cambi live). Per
  // permettere comunque di provare combinazioni diverse nella demo, i campi
  // del form sono tenuti separati dai valori effettivamente passati al
  // widget: "Applica" li copia e forza un remount (showWidget off/on).
  previewShard = this.shard;
  previewAppId = this.appId;
  previewLayerId = this.layerId;
  previewLang = this.lang;
  previewHideCta = this.hideCta;
  showWidget = true;

  applyPreview(): void {
    this.previewShard = this.shard;
    this.previewAppId = this.appId;
    this.previewLayerId = this.layerId;
    this.previewLang = this.lang;
    this.previewHideCta = this.hideCta;
    this.showWidget = false;
    setTimeout(() => (this.showWidget = true));
  }

  get embedSnippet(): string {
    const attrs = [
      `shard="${this.shard}"`,
      `app-id="${this.appId}"`,
      `layer-id="${this.layerId}"`,
      ...(this.lang && this.lang !== 'it' ? [`lang="${this.lang}"`] : []),
      ...(this.hideCta ? ['hide-cta'] : []),
      'style="display:block;width:100%;height:600px"',
    ];
    return [
      `<wm-layer-map\n  ${attrs.join('\n  ')}\n></wm-layer-map>`,
      '',
      `<script type="module" src="${WIDGET_LOADER_URL}"></script>`,
    ].join('\n');
  }

  async copyEmbedSnippet(): Promise<void> {
    await navigator.clipboard.writeText(this.embedSnippet);
  }
}
