// Figure artwork (provided illustrations) placed in a 400 x 480 view space.
// Image pixels map to view units by K, offset by OX / OY, so the mat sits at
// the bottom of the view box and the body is centred on x = 200.

export const VIEW = { w: 400, h: 480 };
const IMG = { w: 896, h: 1200 };
const K = 0.5, OX = 200 - 448 * K, OY = -68;

// chakra centres measured on the artwork (image px), root -> crown
const toView = (ys) => ys.map((y) => [200, y * K + OY]);

export const FIGURES = {
  male: {
    src: 'assets/figure-male.webp',
    chakras: toView([860, 770, 680, 580, 455, 340, 278]),
    haloCenter: [200, 340 * K + OY],
  },
  female: {
    src: 'assets/figure-female.webp',
    chakras: toView([865, 775, 690, 585, 460, 343, 278]),
    haloCenter: [200, 343 * K + OY],
  },
};

const images = {};
export function loadFigures(onLoad) {
  for (const [kind, f] of Object.entries(FIGURES)) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { images[kind] = img; onLoad?.(kind); };
    img.src = f.src;
  }
}

// Render the artwork with a soft elliptical fade so its edges melt into the
// animated cosmos behind it. scale = device pixels per view unit.
export function renderFigure(kind, scale) {
  const img = images[kind];
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = Math.ceil(IMG.w * K * scale);
  c.height = Math.ceil(IMG.h * K * scale);
  const g = c.getContext('2d');
  const f = c.width / IMG.w;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.save();
  g.scale(f, f * (600 / 448));
  const grad = g.createRadialGradient(448, 600 * (448 / 600), 0, 448, 600 * (448 / 600), 448);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.8, 'rgba(0,0,0,1)');
  grad.addColorStop(0.92, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, IMG.w, IMG.w);
  g.restore();
  return { canvas: c, x: OX, y: OY };
}
