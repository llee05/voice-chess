const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, name) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8'), context);
  return vm.runInContext(name, context);
}

const plain = value => JSON.parse(JSON.stringify(value));
module.exports = { load, plain };
