import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './demo.component.html',
})
export class DemoComponent {
  shard = 'camminiditalia';
  appId = '1';
  layerId = '117';
  lang = 'it';
  hideCta = false;
}
