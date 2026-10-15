"""Refresh the checked-in Vosk assets (development only; Python 3, no packages).

The extension is loadable without running this script. Downloads are pinned by
SHA-256. Split the npm bundle's embedded worker into a local file and replace
Embind's three dynamic-code helpers with equivalent closures for MV3's CSP.
"""
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent / 'extension' / 'vendor'
CACHE = Path('/tmp/voice-chess-vosk')
CACHE.mkdir(exist_ok=True)
ROOT.mkdir(exist_ok=True)


def download(name, url, digest):
    path = CACHE / name
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Checksum mismatch: ' + name)
    return data


package = download('vosk-browser-0.0.8.tgz',
    'https://registry.npmjs.org/vosk-browser/-/vosk-browser-0.0.8.tgz',
    'fd16fc7e64c935d7a79cf07c8f67d84232b6485376a59144af8a234979a9a4b4')
with tarfile.open(fileobj=io.BytesIO(package), mode='r:gz') as archive:
    client = archive.extractfile('package/dist/vosk.js').read().decode()
embedded = re.search(r"var WorkerFactory = createBase64WorkerFactory\('([^']+)', null, false\);", client)
if not embedded:
    raise ValueError('Unexpected upstream worker format')
worker = base64.b64decode(embedded[1]).decode()
client = client[:embedded.start()] + "function WorkerFactory() { return new Worker('vendor/vosk-worker.js'); }" + client[embedded.end():]


def replace_function(source, name, next_name, replacement):
    start = source.index('function ' + name + '(')
    end = source.index('function ' + next_name + '(', start)
    return source[:start] + replacement + source[end:]


worker = replace_function(worker, 'createNamedFunction', 'count_emval_handles', r'''
function createNamedFunction(name, body) {
    return Object.defineProperty(function() { return body.apply(this, arguments); },
        'name', {value: makeLegalFunctionName(name)});
}
var emval_free_list=[];
var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];
''')
worker = replace_function(worker, 'craftInvokerFunction', 'heap32VectorToArray', r'''
function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
    if (argTypes.length < 2) throwBindingError('argTypes array size mismatch');
    var isMethod = argTypes[1] !== null && classType !== null;
    var needsStack = argTypes.slice(1).some(function(type) {
        return type !== null && type.destructorFunction === undefined;
    });
    return createNamedFunction(humanName, function() {
        if (arguments.length !== argTypes.length - 2) throwBindingError('Invalid argument count: ' + humanName);
        var destructors = needsStack ? [] : null;
        var wired = [cppTargetFunc];
        var converted = [];
        var first = isMethod ? 1 : 2;
        for (var i = first; i < argTypes.length; i++) {
            var value = argTypes[i].toWireType(destructors, i === 1 ? this : arguments[i - 2]);
            converted.push(value);
            wired.push(value);
        }
        var rv = cppInvokerFunc.apply(null, wired);
        if (needsStack) runDestructors(destructors);
        else for (var i = first; i < argTypes.length; i++) {
            if (argTypes[i].destructorFunction !== null) argTypes[i].destructorFunction(converted[i - first]);
        }
        if (argTypes[0].name !== 'void') return argTypes[0].fromWireType(rv);
    });
}
''')
worker = replace_function(worker, '__emval_get_method_caller', '__emval_incref', r'''
function __emval_get_method_caller(argCount, argTypes) {
    var types = __emval_lookupTypes(argCount, argTypes);
    return __emval_addMethodCaller(function(handle, name, destructors, args) {
        var values = [], offset = 0;
        for (var i = 1; i < argCount; i++) {
            values.push(types[i].readValueFromPointer(args + offset));
            offset += types[i].argPackAdvance;
        }
        var rv = handle[name].apply(handle, values);
        for (var i = 1; i < argCount; i++) {
            if (types[i].deleteObject) types[i].deleteObject(values[i - 1]);
        }
        if (!types[0].isVoid) return types[0].toWireType(destructors, rv);
    });
}
''')
# The model is already packaged locally. Use MEMFS instead of making another
# persistent copy in IndexedDB (which is quota-limited in embedded frames).
for before, after in [
    ('this.Vosk.FS.mount(this.Vosk.IDBFS, {}, storagePath);', ''),
    ('return this.Vosk.syncFilesystem(true);', 'return Promise.resolve();'),
    ('return this.Vosk.syncFilesystem(false);', 'return Promise.resolve();'),
]:
    if worker.count(before) != 1:
        raise ValueError('Unexpected upstream storage helper')
    worker = worker.replace(before, after)
if re.search(r'new Function|new_\(Function|\beval\(', worker):
    raise ValueError('Dynamic execution remains in worker')
header = '// Adapted from vosk-browser 0.0.8 for Manifest V3; see NOTICE and scripts/vendor-vosk.py.\n'
(ROOT / 'vosk.js').write_text(header + client)
(ROOT / 'vosk-worker.js').write_text(header + worker)

model = download('model.zip',
    'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
    '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498')
with (ROOT / 'model-en-us-0.15.tar.gz').open('wb') as output:
    with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive, zipfile.ZipFile(io.BytesIO(model)) as source:
            for name in sorted(source.namelist()):
                data = b'' if name.endswith('/') else source.read(name)
                entry = tarfile.TarInfo('model/' + name.split('/', 1)[1])
                entry.size = len(data)
                entry.mode = 0o755 if name.endswith('/') else 0o644
                if name.endswith('/'):
                    entry.type = tarfile.DIRTYPE
                archive.addfile(entry, io.BytesIO(data))

for name in ['vosk.js', 'vosk-worker.js', 'model-en-us-0.15.tar.gz']:
    data = (ROOT / name).read_bytes()
    print(name, len(data), hashlib.sha256(data).hexdigest())

licenses = [
    ('COPYING', 'https://raw.githubusercontent.com/ccoreilly/vosk-browser/master/COPYING', 'bb618af833c817ab01c1564bd3ec75ba4b4f9cf30910a4a2168e30a674ee8cc6'),
    ('NOTICE', 'https://raw.githubusercontent.com/ccoreilly/vosk-browser/master/NOTICE', '31dac6be41950e1c649686f51a1fe1b47c9cdcd993def80bd104f85df2badd5c'),
    ('EMSCRIPTEN-LICENSE', 'https://raw.githubusercontent.com/emscripten-core/emscripten/2.0.31/LICENSE', '620a78084fc7ca97c0b5dea9abf891f3ffcadfdbf305276f099c9c4e12fc1d86'),
    ('UUID-LICENSE', 'https://raw.githubusercontent.com/uuidjs/uuid/v9.0.0/LICENSE.md', 'beaa6b04fb82e41dd2ad679e19e27953afb5999b1abbb455b6564e78ebfeb332'),
]
for name, url, digest in licenses:
    (ROOT / name).write_bytes(download(name, url, digest))
with zipfile.ZipFile(io.BytesIO(model)) as source:
    (ROOT / 'MODEL-README').write_bytes(source.read('vosk-model-small-en-us-0.15/README'))
assets = ['vosk.js', 'vosk-worker.js', 'model-en-us-0.15.tar.gz', 'COPYING', 'NOTICE', 'EMSCRIPTEN-LICENSE', 'UUID-LICENSE', 'MODEL-README']
(ROOT / 'assets.json').write_text(json.dumps({name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in assets}, indent=2) + '\n')
