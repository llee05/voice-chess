const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.permissions, undefined);
assert.equal(manifest.host_permissions, undefined);
for (const script of manifest.content_scripts) {
  assert.equal(script.world, 'MAIN');
  for (const name of script.js) new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name });
}
for (const name of [...Object.values(manifest.icons), manifest.action.default_popup, 'popup.css']) {
  assert.ok(fs.statSync(path.join(root, name)).size > 0, `Missing asset: ${name}`);
}
console.log('Manifest, scripts, and packaged assets passed.');
