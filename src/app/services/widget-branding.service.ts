import {Injectable} from '@angular/core';
import {EnvironmentService} from '@wm-core/services/environment.service';

export type WidgetPlatform = 'ios' | 'android' | null;

// Domini noti divergenti dal pattern di default `<shard>.webmapp.it`
// (stessa lista di eccezioni del vecchio widget vanilla JS, vedi
// docs/features/8259-replica-ui-vecchio-wm-layer-map/overview.md — rischio
// accettato: un nuovo shard futuro con dominio proprio non elencato qui
// produrrebbe una CTA con dominio sbagliato, come già accadeva nel vecchio
// widget se non aggiornato).
const CTA_DOMAIN_OVERRIDES: Readonly<Record<string, string>> = {
  osm2cai: 'osm2cai.cai.it',
  maphub: 'maphub.it',
};

// Stessi asset del vecchio widget vanilla JS (webmappsrl/wm-layer-map,
// cartella assets/), copiati in public/assets/ per essere serviti dalla
// build Angular (glob "**/*" da "public", vedi angular.json).
const APP_ICON_FALLBACK_SRC = 'assets/branding/default-icon-fallback.png';
const APP_STORE_BADGE_SRC = 'assets/store-badges/app-store-badge-en.png';
const GOOGLE_PLAY_BADGE_SRC = 'assets/store-badges/google-play-badge-en.png';

@Injectable({providedIn: 'root'})
export class WidgetBrandingService {
  readonly APP_ICON_FALLBACK_SRC = APP_ICON_FALLBACK_SRC;
  readonly APP_STORE_BADGE_SRC = APP_STORE_BADGE_SRC;
  readonly GOOGLE_PLAY_BADGE_SRC = GOOGLE_PLAY_BADGE_SRC;

  constructor(private _environmentSvc: EnvironmentService) {}

  detectPlatform(userAgent: string = navigator.userAgent): WidgetPlatform {
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      return 'ios';
    }
    if (/Android/.test(userAgent)) {
      return 'android';
    }
    return null;
  }

  buildCtaUrl(appId: string, layerId: string): string {
    const shardName = this._environmentSvc.shardName;
    const subdomain = shardName === 'geohub' ? 'app' : shardName;
    const domain = CTA_DOMAIN_OVERRIDES[shardName] ?? `${subdomain}.webmapp.it`;
    const base = `https://${appId}.${domain}/`;
    const numericLayerId = Number(layerId);
    if (layerId != null && layerId !== '' && !Number.isNaN(numericLayerId)) {
      return `${base}?layer=${layerId}`;
    }
    return base;
  }

  buildAppIconUrl(appId: string): string | null {
    const origin = this._environmentSvc.origin;
    if (!origin) {
      return null;
    }
    return `${origin}/api/app/webmapp/${appId}/resources/icon.png`;
  }
}
