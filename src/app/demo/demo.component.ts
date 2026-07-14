import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {WmLayerMapComponent} from '../wm-layer-map/wm-layer-map.component';

const WIDGET_LOADER_URL =
  'https://cdn.jsdelivr.net/gh/webmappsrl/wm-elements@dist/wm-layer-map/wm-layer-map.js';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [FormsModule, WmLayerMapComponent],
  templateUrl: './demo.component.html',
})
export class DemoComponent {
  shard = 'camminiditalia';
  appId = '1';
  layerId = '120';
  lang = 'it';
  hideCta = false;

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
