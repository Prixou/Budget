# Tesseract.js (lecture de captures d'écran)

Moteur de reconnaissance de texte utilisé par « Importer une capture d'écran ». Il s'exécute dans le navigateur : les images ne quittent jamais l'appareil. Ces fichiers ne sont téléchargés qu'à la première utilisation.

| Fichier | Origine | Licence |
|---|---|---|
| `tesseract.esm.min.js`, `worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 (`dist/`) | Apache 2.0 (`LICENSE-tesseract.js.md`) |
| `core/tesseract-core-simd-lstm.wasm.js`, `core/tesseract-core-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 7.0.0 | Apache 2.0 (`core/LICENSE`) |
| `lang/fra.traineddata.gz` | [@tesseract.js-data/fra](https://github.com/naptha/tessdata) 1.0.0, modèle `4.0.0_best_int` | MIT |

Mise à jour : remplacer les fichiers par ceux des nouvelles versions publiées sur npm (mêmes noms).
