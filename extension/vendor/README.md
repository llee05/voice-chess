# Bundled recognizer

These files are shipped with the extension. No CDN, installer, external service,
API key, or user model download is used at runtime.

- `vosk.js`, `vosk-worker.js`: [vosk-browser 0.0.8](https://www.npmjs.com/package/vosk-browser/v/0.0.8), Apache-2.0. The worker includes Vosk/Kaldi and its WebAssembly binary. Upstream notices are in `NOTICE` and `COPYING`; additional embedded-code licenses are in `EMSCRIPTEN-LICENSE` and `UUID-LICENSE`. The original Microsoft helper notice remains in the scripts.
- `model-en-us-0.15.tar.gz`: [vosk-model-small-en-us-0.15](https://alphacephei.com/vosk/models), US English, copyright 2020 Alpha Cephei Inc, Apache-2.0. Repacked from the official ZIP as a tar archive with one `model/` root. See `MODEL-README` and `COPYING`.
- `assets.json`: SHA-256 checksums checked by `npm run check`.

Changes from the npm runtime are limited to extracting the embedded worker into
a local script, replacing three Embind dynamic-code helpers with closures, and
using memory storage instead of IndexedDB. This permits Manifest V3's CSP with
`wasm-unsafe-eval` and no `unsafe-eval` or blob workers. The patched source is
reproducible with `python scripts/vendor-vosk.py` (development only). The script
verifies pinned download checksums before changing any packaged assets. A change
to the upstream compiler or bundle layout requires reviewing these adaptations.

The model archive is about 41.1 MB; the JS/WASM runtime is about 4.4 MB. Vosk uses
more working memory after decompressing and loading the model. Removing the
recognizer frame releases the worker; extracted model files are never persisted.
