import {Point} from 'geojson';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import {Point as OlPoint} from 'ol/geom';
import {fromLonLat} from 'ol/proj';
import Icon from 'ol/style/Icon';
import Style from 'ol/style/Style';
import {DEF_LINE_COLOR, ICN_PATH, logoBase64} from '@map-core/readonly';
import {downloadBase64Img, fromHEXToColor} from '@map-core/utils';
import {WmFeature} from '@wm-types/feature';

export interface RelatedPoiMarkerOptions {
  /** set di icone SVG dell'app, indicizzate per identifier/icon_name */
  poiIcons: {[identifier: string]: string};
  selected: boolean;
  /** feature OL preesistente (dai POI globali) da riusare al posto di crearne una nuova */
  existingFeature?: Feature<Geometry> | null;
}

const MARKER_SIZE = 46;
const HALO_RADIUS = 23;
const PHOTO_RADIUS = 18;

/**
 * Costruisce la feature-marker di un related POI (contratto in
 * docs/features/riscrittura-direttiva-track-related-pois/overview.md).
 * Precedenza: foto (show_image_on_map / 108x137) → icona SVG ricolorata →
 * PNG ICN_PATH. Un fallimento della pipeline foto (CORS, immagine rotta)
 * degrada all'icona; ritorna null se il POI non ha alcuna via di rendering.
 */
export async function createRelatedPoiMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Promise<Feature<Geometry> | null> {
  const properties = poi.properties ?? null;
  if (properties == null) {
    return null;
  }
  const showImageOnMap = (properties as any).feature_image?.show_image_on_map;
  const usePhoto =
    showImageOnMap === true ||
    (showImageOnMap == null && (properties as any).feature_image?.sizes?.['108x137'] != null);

  if (usePhoto) {
    try {
      return await createPhotoMarker(poi, options);
    } catch {
      // foto rotta o fetch CORS fallito sul dominio host: si degrada all'icona
    }
  }
  return createIconMarker(poi, options);
}

async function createPhotoMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Promise<Feature<Geometry>> {
  const properties: any = poi.properties;
  const url = properties.feature_image?.sizes?.['108x137'];
  const imgB64 = url != null ? ((await downloadBase64Img(url)) as string) : (logoBase64 as string);
  const feature = buildPointFeature(poi, options.existingFeature);

  // Parità legacy: se il poi_type ha un'icona nel set dell'app, l'icona
  // vince sulla foto (caso raro: i related POI di norma non hanno
  // taxonomyIdentifiers).
  const poiTypeIdentifiers: string[] = (properties.taxonomyIdentifiers ?? []).filter(
    (p: string) => p.indexOf('poi_type') > -1,
  );
  if (poiTypeIdentifiers.length === 1 && options.poiIcons[poiTypeIdentifiers[0]] != null) {
    let svgIcon = options.poiIcons[poiTypeIdentifiers[0]];
    if (options.selected) {
      svgIcon = svgIcon
        .replace('darkorange', 'temp')
        .replace('white', 'darkorange')
        .replace('temp', 'white');
    }
    feature.setStyle(
      new Style({
        zIndex: 200,
        image: new Icon({
          anchor: [0.5, 0.5],
          scale: 1,
          src: `data:image/svg+xml;utf8,${svgIcon}`,
        }),
      }),
    );
    return feature;
  }

  const canvas = await drawPhotoCanvas(imgB64, options.selected);
  feature.setStyle(
    new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        // canvas.toDataURL: dimensioni intrinseche, niente imgSize (deprecato in OL7)
        src: canvas.toDataURL('image/png'),
      }),
    }),
  );
  return feature;
}

async function drawPhotoCanvas(imgB64: string, selected: boolean): Promise<HTMLCanvasElement> {
  const img = await loadImage(imgB64);
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_SIZE;
  canvas.height = MARKER_SIZE;
  const ctx = canvas.getContext('2d');
  const c = MARKER_SIZE / 2;

  // alone esterno (opacità piena da selezionato, come la legacy)
  ctx.globalAlpha = selected ? 1 : 0.2;
  ctx.fillStyle = DEF_LINE_COLOR;
  ctx.beginPath();
  ctx.arc(c, c, HALO_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // foto ritagliata nel cerchio interno, cover centrato
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, PHOTO_RADIUS, 0, Math.PI * 2);
  ctx.clip();
  const d = PHOTO_RADIUS * 2;
  const scale = Math.max(d / img.width, d / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, c - w / 2, c - h / 2, w, h);
  ctx.restore();

  // bordo bianco del cerchio foto
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.arc(c, c, PHOTO_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  return canvas;
}

function createIconMarker(
  poi: WmFeature<Point>,
  options: RelatedPoiMarkerOptions,
): Feature<Geometry> | null {
  const existing = options.existingFeature ?? null;
  const properties: any = existing != null ? existing.getProperties() : poi.properties;
  // Come la legacy: senza feature globale riusabile e senza taxonomy non
  // esiste una via di rendering (il ramo legacy `else if (svgIcon)` era
  // irraggiungibile: svgIcon derivava dalla stessa taxonomy).
  if (existing == null && properties?.taxonomy == null) {
    return null;
  }
  const taxonomy = properties.taxonomy ?? null;
  const poiType = taxonomy?.poi_type ?? null;
  const svgFromIcons =
    poiType?.icon_name && options.poiIcons[poiType.icon_name] != null
      ? options.poiIcons[poiType.icon_name]
      : null;
  let icn = getIcnFromTaxonomies(properties.taxonomyIdentifiers ?? poiType?.identifier);
  if (!icn && poiType?.icon_name) {
    icn = poiType.icon_name;
  }

  // ternari identici alla legacy (un color === '' deve comportarsi uguale)
  const poiColor = poiType?.color ? poiType.color : properties.color ? properties.color : '#ff8c00';
  const namedPoiColor = fromHEXToColor[poiColor] || 'darkorange';

  let iconStyle: Style;
  if (svgFromIcons != null) {
    let processedSvg = svgFromIcons.split('darkorange').join(namedPoiColor);
    if (options.selected) {
      // parità legacy: con namedPoiColor !== 'darkorange' il replace del
      // circle non matcha nulla — comportamento voluto, non "correggerlo"
      processedSvg = processedSvg
        .replace(/<circle fill="darkorange"/g, '<circle fill="white" ')
        .replace(/<g fill="white"/g, `<g fill="${namedPoiColor || 'darkorange'}" `);
    }
    iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        scale: 1,
        src: `data:image/svg+xml;utf8,${processedSvg}`,
      }),
    });
  } else {
    iconStyle = new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        scale: 0.5,
        src: `${ICN_PATH}/${icn}.png`,
      }),
    });
  }
  if (properties.svgIcon != null && svgFromIcons == null) {
    let src = `data:image/svg+xml;utf8,${properties.svgIcon.replaceAll(
      'darkorange',
      namedPoiColor,
    )}`;
    if (options.selected) {
      src = `data:image/svg+xml;utf8,${properties.svgIcon
        .replaceAll(`<circle fill="darkorange"`, '<circle fill="white" ')
        .replaceAll(`<g fill="white"`, `<g fill="${namedPoiColor || 'darkorange'}" `)}`;
    }
    iconStyle = new Style({
      image: new Icon({anchor: [0.5, 0.5], scale: 1, src}),
    });
  }
  const feature = buildPointFeature(poi, existing);
  feature.setStyle(iconStyle);
  return feature;
}

function buildPointFeature(
  poi: WmFeature<Point>,
  existing?: Feature<Geometry> | null,
): Feature<Geometry> {
  if (existing != null) {
    // Attenzione (parità): riusare la feature dei POI globali muta il suo
    // stile anche nel layer di wmMapPois — effetto legacy voluto, vedi overview.
    return existing;
  }
  const [lon, lat] = poi.geometry.coordinates as number[];
  const position = fromLonLat([lon, lat]);
  const feature = new Feature({type: 'icon', geometry: new OlPoint(position)});
  feature.setId(poi.properties.id);
  return feature;
}

function getIcnFromTaxonomies(taxonomyIdentifiers: string[] | string | null | undefined): string {
  if (taxonomyIdentifiers == null) {
    return null;
  }
  const identifiers: string[] = Array.isArray(taxonomyIdentifiers)
    ? taxonomyIdentifiers
    : typeof taxonomyIdentifiers === 'string' && taxonomyIdentifiers.length > 0
      ? [taxonomyIdentifiers]
      : [];
  const excludedIcn = ['theme_ucvs'];
  const res = identifiers.filter(
    p => p != null && excludedIcn.indexOf(p) === -1 && p.indexOf('poi_type') > -1,
  );
  return res.length > 0 ? res[0] : identifiers.length > 0 ? identifiers[0] : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
