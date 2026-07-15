const STYLE_ELEMENT_ID = 'wm-layer-map-gallery-modal-styles';

// Ionic monta ion-modal nel document (fuori dallo Shadow DOM del widget).
// Gli stili dei componenti wm-core (encapsulation None) finiscono nel bundle
// ma non sempre prevalgono sul layout del modal; in più `image-detail` usa
// `align-items: flex-start` + `width: -webkit-fill-available` su wm-img,
// combo che in diversi browser lascia wm-img stretto e alto con
// `object-fit: cover` → foto tagliata ai lati.
export const GALLERY_MODAL_GLOBAL_CSS = `
wm-modal-image {
  --background: white;
  --color: black;
  margin-top: env(safe-area-inset-top);
  margin-bottom: env(safe-area-inset-bottom);
  height: calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}

ion-modal {
  --border-radius: 16px;
  --box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

ion-modal::part(backdrop) {
  opacity: 1;
}

ion-modal ion-fab-button {
  --background: white;
  --color: black;
  top: env(safe-area-inset-top);
}

@media only screen and (min-width: 768px) and (min-height: 768px) {
  ion-modal {
    --width: 700px;
    --height: 700px;
  }
}

wm-image-detail {
  --footer-height: 55px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

wm-image-detail .gallery {
  flex: 1 1 auto;
  min-height: 0;
  height: calc(100% - var(--footer-height));
}

wm-image-detail .gallery swiper-slide {
  width: 100% !important;
  height: 100%;
  box-sizing: border-box;
  background-color: white;
  display: flex;
  flex-direction: column;
  align-items: stretch !important;
  justify-content: center;
  padding: 16px;
}

wm-image-detail .gallery swiper-slide wm-img {
  width: 100% !important;
  max-width: 100% !important;
  align-self: stretch !important;
  flex: 1 1 auto;
  min-height: 0;
}

wm-image-detail .gallery swiper-slide wm-img .wm-img-image {
  object-fit: contain !important;
  width: 100%;
  height: 100%;
  border-radius: 16px;
}

wm-image-detail .gallery swiper-slide .image-name {
  font-size: var(--wm-font-size-base);
  font-weight: 700;
  margin-top: 24px;
  margin-left: 4px;
  color: var(--ion-text-color);
}

wm-image-detail .gallery swiper-slide .image-caption {
  font-size: var(--wm-font-size-sm);
}

wm-image-detail .footer {
  display: flex;
  height: var(--footer-height);
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

wm-image-detail .footer > * {
  margin: 0 16px;
}

wm-image-detail .footer ion-button {
  width: 32px;
  height: 32px;
  --border-radius: 50%;
  --padding-start: 0;
  --padding-end: 0;
  --box-shadow: none;
  border-radius: 50%;
}

wm-image-detail .footer ion-button ion-icon {
  font-size: 20px;
  color: var(--ion-text-color, #000);
}

wm-image-detail .footer ion-button.disabled {
  opacity: 0;
  pointer-events: none;
}

// wm-modal-image usa <i class="icon-outline-close"> (font custom wm-core), ma
// il modal è fuori dallo Shadow DOM dove abbiamo le SVG inline per quel font.
ion-modal .icon-outline-close {
  display: inline-block;
  width: 24px;
  height: 24px;
  background: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20512%20512'%3E%3Cpath%20fill='%23000'%20d='m289.94%20256%2095-95A24%2024%200%200%200%20351%20127l-95%2095-95-95a24%2024%200%200%200-34%2034l95%2095-95%2095a24%2024%200%201%200%2034%2034l95-95%2095%2095a24%2024%200%200%200%2034-34Z'/%3E%3C/svg%3E")
    center / contain no-repeat;
}

ion-modal .icon-outline-close:before {
  content: none;
}
`;

export function ensureGalleryModalGlobalStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID) != null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = GALLERY_MODAL_GLOBAL_CSS;
  document.head.appendChild(style);
}
