import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {WmLayerMapComponent} from '../wm-layer-map/wm-layer-map.component';

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
}
