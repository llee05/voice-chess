const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.join(root, '../package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, metadata.version, 'Manifest and package versions must match');
assert.ok(Number(manifest.minimum_chrome_version) >= 111, 'Keep the declared Chrome minimum at 111 or newer');
for (const key of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']) {
  assert.equal(manifest[key], undefined, `Unexpected permissions: ${key}`);
}
assert.equal(manifest.content_scripts.length, 1);
for (const script of manifest.content_scripts) {
  assert.deepEqual(script.matches, ['https://www.chess.com/puzzles/rush', 'https://www.chess.com/puzzles/rush/*', 'https://www.chess.com/puzzles/rush?*'], 'Keep injection limited to Puzzle Rush');
  assert.deepEqual(script.js, ['commands.js', 'board.js', 'speech.js', 'content.js'], 'Content script dependency order changed');
  assert.equal(script.world, 'MAIN');
  assert.equal(script.run_at, 'document_idle');
  assert.ok(!script.all_frames, 'Inject only in the top-level page');
  for (const name of script.js) new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name });
}
assert.deepEqual(Object.keys(manifest.icons), ['16', '48', '128']);
for (const [size, name] of Object.entries(manifest.icons)) {
  const png = fs.readFileSync(path.join(root, name));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Invalid PNG: ${name}`);
  assert.equal(png.subarray(12, 16).toString(), 'IHDR', `Missing PNG header: ${name}`);
  assert.equal(png.readUInt32BE(16), Number(size), `Wrong icon width: ${name}`);
  assert.equal(png.readUInt32BE(20), Number(size), `Wrong icon height: ${name}`);
}
for (const name of [...Object.values(manifest.icons), manifest.action.default_popup, 'popup.css']) {
  assert.ok(fs.statSync(path.join(root, name)).size > 0, `Missing asset: ${name}`);
}
console.log('Manifest scope, script order, versions, syntax, and packaged assets passed.');
