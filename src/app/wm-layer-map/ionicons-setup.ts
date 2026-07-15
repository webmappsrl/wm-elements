import {addIcons, setAssetPath} from 'ionicons/components';
import {
  arrowBack,
  arrowBackOutline,
  arrowForward,
  arrowForwardOutline,
  close,
} from 'ionicons/icons';

const SETUP_FLAG = '__wmLayerMapIoniconsReady';

/**
 * Ionicons in un widget Angular Elements non ha un asset path predefinito:
 * `<ion-icon name="...">` fallisce in silenzio (warning in console) e resta
 * vuoto. La webapp risolve con `svg/*.svg` serviti dalla root dell'app;
 * qui registriamo le icone usate dal widget e impostiamo la base URL degli
 * asset (demo locale, pagina test, CDN jsDelivr del custom element).
 */
export function ensureIoniconsSetup(): void {
  const win = window as Window & {[SETUP_FLAG]?: boolean};
  if (win[SETUP_FLAG]) {
    return;
  }
  win[SETUP_FLAG] = true;

  setAssetPath(resolveWidgetAssetBase());

  addIcons({
    close,
    arrowBack,
    arrowForward,
    arrowBackOutline,
    arrowForwardOutline,
  });
}

function resolveWidgetAssetBase(): string {
  const scripts = [...document.querySelectorAll('script[src]')] as HTMLScriptElement[];
  const widgetScript = scripts.find(script => /wm-layer-map/.test(script.src));
  if (widgetScript) {
    return new URL('./', widgetScript.src).href;
  }
  return new URL('./', document.baseURI).href;
}
