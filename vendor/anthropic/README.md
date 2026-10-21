# SDK Anthropic (version navigateur)

`anthropic-sdk.js` est le SDK officiel [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) 0.131.0 (licence MIT, fichier `LICENSE`), réuni en un seul module ES pour le navigateur. Il n'est chargé que si l'assistant IA est activé dans les paramètres.

Reconstruction (avec Node 20 ou plus récent) :

```bash
mkdir build && cd build && echo '{"type":"module"}' > package.json
npm install --save-exact esbuild@0.28.2 @anthropic-ai/sdk@0.131.0
cat > entry.mjs <<'JS'
export { default } from '@anthropic-ai/sdk';
export { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
export { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
JS
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=eof --outfile=anthropic-sdk.js
```

`--platform=browser` applique le champ `browser` du paquet : les modules propres à Node sont remplacés par leurs versions navigateur.
