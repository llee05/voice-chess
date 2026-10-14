const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers.cjs');
const { parse, resolve } = load('commands.js', 'VoiceChessCommands');

for (const [text, expected] of [
  ['e two to e four', { kind: 'move', from: 'e2', to: 'e4' }],
  ['echo two to echo four', { kind: 'move', from: 'e2', to: 'e4' }],
  ['Please move E2-E4.', { kind: 'move', from: 'e2', to: 'e4' }],
  ['e2e4', { kind: 'move', from: 'e2', to: 'e4' }],
  ['e4', { kind: 'move', piece: 'p', to: 'e4' }],
  ['e four', { kind: 'move', piece: 'p', to: 'e4' }],
  ['knight to f three', { kind: 'move', piece: 'n', to: 'f3' }],
  ['night f3', { kind: 'move', piece: 'n', to: 'f3' }],
  ['queen takes hotel seven', { kind: 'move', piece: 'q', to: 'h7' }],
  ['bishop to see four', { kind: 'move', piece: 'b', to: 'c4' }],
  ['rook a to e seven', { kind: 'move', piece: 'r', origin: 'a', to: 'e7' }],
  ['rook one to a four', { kind: 'move', piece: 'r', origin: '1', to: 'a4' }],
  ['knight from g one to f three', { kind: 'move', piece: 'n', from: 'g1', to: 'f3' }],
  ['d takes e six', { kind: 'move', piece: 'p', origin: 'd', to: 'e6' }],
  ['e seven to e eight promote to knight', { kind: 'move', from: 'e7', to: 'e8', promotion: 'n' }],
  ['pawn a takes b eight promote to knight', { kind: 'move', piece: 'p', origin: 'a', to: 'b8', promotion: 'n' }],
  ['e7e8q', { kind: 'move', from: 'e7', to: 'e8', promotion: 'q' }],
  ['e8=Q', { kind: 'move', piece: 'p', to: 'e8', promotion: 'q' }],
  ['exd5', { kind: 'move', piece: 'p', origin: 'e', to: 'd5' }],
  ['Nf3', { kind: 'move', piece: 'n', to: 'f3' }],
  ['Raxd1+', { kind: 'move', piece: 'r', origin: 'a', to: 'd1' }],
  ['castle kingside', { kind: 'castle', side: 'king' }],
  ['castle queen side', { kind: 'castle', side: 'queen' }],
  ['O-O-O', { kind: 'castle', side: 'queen' }],
  ['stop listening', { kind: 'stop' }],
  ['help', { kind: 'help' }],
]) {
  test(`parses ${JSON.stringify(text)}`, () => assert.deepEqual(plain(parse(text)), expected));
}

for (const text of ['', 'hello', 'maybe e2 to e4', 'e two to e nine', 'e two to e four and d two to d four', 'queen', 'knight f3 please', 'e7e8 promote to king', 'the score is e four', 'a'.repeat(200)]) {
  test(`ignores unsupported speech ${JSON.stringify(text.slice(0, 50))}`, () => assert.equal(parse(text), null));
}

test('does not choose between two knights', () => {
  const result = resolve(parse('knight f3'), [{ piece: 'n', from: 'g1', to: 'f3' }, { piece: 'n', from: 'd2', to: 'f3' }]);
  assert.match(result.error, /g1 or d2/);
  assert.equal(result.move, undefined);
});

test('explicit source resolves ambiguous moves and honors the piece name', () => {
  const moves = [{ piece: 'n', from: 'g1', to: 'f3' }, { piece: 'n', from: 'd2', to: 'f3' }];
  assert.equal(resolve(parse('g one to f three'), moves).move.from, 'g1');
  assert.equal(resolve(parse('rook g one to f three'), moves).move, undefined);
});

test('rejects moves absent from native legal moves, including pinned pieces', () => {
  assert.equal(resolve(parse('knight f3'), [{ piece: 'n', from: 'd2', to: 'e4' }]).move, undefined);
});

test('uses file and rank disambiguation', () => {
  const moves = [{ piece: 'r', from: 'a1', to: 'e1' }, { piece: 'r', from: 'h1', to: 'e1' }];
  assert.equal(resolve(parse('rook alpha to echo one'), moves).move.from, 'a1');
  assert.equal(resolve(parse('rook one to echo one'), moves).move, undefined);
});

test('supports default queen promotion and explicit underpromotion', () => {
  const moves = ['q', 'r', 'b', 'n'].map(promotion => ({ piece: 'p', from: 'e7', to: 'e8', promotion }));
  assert.equal(resolve(parse('e7e8'), moves).move.promotion, 'q');
  assert.equal(resolve(parse('e7e8n'), moves).move.promotion, 'n');
  assert.equal(resolve(parse('e7e8n'), []).move, undefined);
});

test('castles for either side using only legal moves', () => {
  const moves = [{ piece: 'k', from: 'e8', to: 'g8' }, { piece: 'k', from: 'e8', to: 'c8' }];
  assert.equal(resolve(parse('castle kingside'), moves).move.to, 'g8');
  assert.equal(resolve(parse('castle queenside'), moves).move.to, 'c8');
});

test('deduplicates repeated legal moves', () => {
  const move = { piece: 'n', from: 'g1', to: 'f3' };
  assert.equal(resolve(parse('knight f3'), [move, move]).move.from, 'g1');
});
