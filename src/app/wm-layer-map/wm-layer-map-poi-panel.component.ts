import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import {Point} from 'geojson';
import {WmFeature} from '@wm-types/feature';
import {WmCoreModule} from '@wm-core/wm-core.module';
import {CommonModule} from '@angular/common';
import {Store} from '@ngrx/store';
import {confPOIFORMS} from '@wm-core/store/conf/conf.selector';

export interface WmLayerMapPoiPanelViewModel {
  [key: string]: any;
  address?: string;
  address_link?: string;
}

@Component({
  selector: 'wm-layer-map-poi-panel',
  standalone: true,
  imports: [CommonModule, WmCoreModule],
  templateUrl: './wm-layer-map-poi-panel.component.html',
  styleUrl: './wm-layer-map-poi-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class WmLayerMapPoiPanelComponent {
  @Input() showRelatedNav = false;

  confPOIFORMS$ = inject(Store).select(confPOIFORMS);

  @Output() dismiss = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  poi: WmFeature<Point> | null = null;
  poiProperties: WmLayerMapPoiPanelViewModel | null = null;
  enableGallery = false;

  @HostBinding('class.panel-compact')
  get isCompact(): boolean {
    if (this.poiProperties == null) {
      return true;
    }
    const props = this.poiProperties;
    return (
      !props.excerpt &&
      !this.enableGallery &&
      !props.description &&
      !props.form?.description &&
      !props.address &&
      !props.ele &&
      !props.contact_phone &&
      !props.contact_email &&
      !props.related_url &&
      !props.osm_url &&
      !props.audio &&
      !props.form &&
      !props.taxonomy_where
    );
  }

  @Input('poi') set setPoi(poi: WmFeature<Point> | null) {
    if (poi?.properties == null) {
      this.poi = null;
      this.poiProperties = null;
      this.enableGallery = false;
      return;
    }

    this.poi = poi;
    const derived: Partial<WmLayerMapPoiPanelViewModel> = {};

    try {
      derived.address =
        poi.properties.addr_complete ??
        [poi.properties.addr_locality, poi.properties.addr_street].filter(f => f != null).join(', ');
    } catch {
      derived.address = '';
    }

    try {
      derived.address_link = [poi.properties.addr_locality, poi.properties.addr_street]
        .filter(f => f != null)
        .join('+');
    } catch {
      derived.address_link = '';
    }

    if (poi.properties.related_url != null) {
      if (poi.properties.related_url[''] === null) {
        delete poi.properties.related_url[''];
      }
      derived.related_url =
        Object.keys(poi.properties.related_url).length === 0 ? null : poi.properties.related_url;
    }

    this.poiProperties = {...poi.properties, ...derived} as WmLayerMapPoiPanelViewModel;
    this.enableGallery =
      this.poiProperties.feature_image != null ||
      (this.poiProperties.image_gallery != null && this.poiProperties.image_gallery.length > 0);
  }

  contactPhones(value: string | null | undefined): string[] {
    if (value == null || value === '') {
      return [];
    }
    if (!value.includes(',')) {
      return [value.trim()];
    }
    return value.split(',').map(phone => phone.trim());
  }
}
