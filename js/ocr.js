// Reconnaissance du texte d'une image, entièrement sur l'appareil : l'image n'est envoyée nulle part.
// Moteur Tesseract.js hébergé avec l'application (vendor/tesseract), chargé à la première utilisation.
const VENDOR = new URL('../vendor/tesseract/', import.meta.url).href;
// Prise en charge du SIMD WebAssembly (même module de test que la bibliothèque wasm-feature-detect).
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

const STATUS = {
  'loading tesseract core': 'Chargement du moteur de lecture',
  'initializing tesseract': 'Préparation du moteur de lecture',
  'loading language traineddata': 'Chargement du français',
  'initializing api': 'Préparation du moteur de lecture',
  'recognizing text': 'Lecture du texte',
};

let workerPromise = null;
let report = null;

export function ocrSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && typeof createImageBitmap === 'function';
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { default: Tesseract } = await import(`${VENDOR}tesseract.esm.min.js`);
      const simd = WebAssembly.validate(SIMD_TEST);
      const worker = await Tesseract.createWorker('fra', 1, {
        workerPath: `${VENDOR}worker.min.js`,
        corePath: `${VENDOR}core/tesseract-core-${simd ? 'simd-' : ''}lstm.wasm.js`,
        langPath: `${VENDOR}lang`,
        workerBlobURL: false,
        logger: (m) => report?.({ label: STATUS[m.status] || 'Préparation', progress: m.progress || 0, reading: m.status === 'recognizing text' }),
      });
      // Lecture ligne par ligne sur toute la largeur : le libellé et le montant restent sur la même ligne.
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/**
 * Prépare la capture : niveaux de gris, agrandissement des petites images,
 * et inversion d'un écran en mode sombre (texte clair sur fond foncé).
 */
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 900 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
    total += y;
  }
  if (total / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Lit le texte de plusieurs captures, l'une après l'autre.
 * onProgress({ label, progress (0 à 1), index, count }) ; renvoie un texte par image.
 */
export async function readImages(files, onProgress = () => {}) {
  const texts = [];
  for (let index = 0; index < files.length; index++) {
    report = (p) => onProgress({ ...p, index, count: files.length });
    onProgress({ label: 'Préparation de l’image', progress: 0, index, count: files.length });
    const [worker, canvas] = await Promise.all([getWorker(), prepare(files[index])]);
    const { data } = await worker.recognize(canvas);
    texts.push(data.text || '');
  }
  report = null;
  return texts;
}

/** Libère la mémoire du moteur (il se recharge depuis le cache à la prochaine lecture). */
export async function releaseOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) (await pending.catch(() => null))?.terminate();
}
