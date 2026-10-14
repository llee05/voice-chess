const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers.cjs');
const { parse, resolve } = load('commands.js', 'VoiceChessCommands');

for (const [text, san] of [
  ['e4', 'e4'], ['e5', 'e5'], ['E4', 'e4'], ['e four', 'e4'], ['e five', 'e5'],
  ['Nf3', 'Nf3'], ['nf3', 'Nf3'], ['N f three', 'Nf3'], ['en f three', 'Nf3'],
  ['Knight f three.', 'Nf3'], ['night f3', 'Nf3'], ['Bb5', 'Bb5'],
  ['Qxh7', 'Qxh7'], ['queen takes h seven', 'Qxh7'], ['queen x h7', 'Qxh7'],
  ['exd5', 'exd5'], ['e takes d five', 'exd5'],
  ['bxc5', 'bxc5'], ['Bxc5', 'Bxc5'], ['bishop takes c five', 'Bxc5'], ['B X c five', 'Bxc5'],
  ['Ngf3', 'Ngf3'], ['knight g f three', 'Ngf3'], ['R1e2', 'R1e2'], ['rook one e two', 'R1e2'],
  ['Rae2', 'Rae2'], ['Ng1f3', 'Ng1f3'], ['B4e5', 'B4e5'], ['bishop four e five', 'B4e5'],
  ['O-O', 'O-O'], ['0-0', 'O-O'], ['O O', 'O-O'],
  ['O-O-O', 'O-O-O'], ['zero zero zero', 'O-O-O'],
  ['e8=Q', 'e8=Q'], ['e eight equals queen', 'e8=Q'], ['e8=n', 'e8=N'], ['e eight equals knight', 'e8=N'],
  ['axb8=N+', 'axb8=N+'], ['a takes b eight equals knight check', 'axb8=N+'], ['e1=R', 'e1=R'],
  ['Qh7+', 'Qh7+'], ['queen h seven check', 'Qh7+'], ['Qh7#', 'Qh7#'], ['queen h seven check mate', 'Qh7#'],
]) {
  test(`normalizes ${JSON.stringify(text)} to ${san}`, () => assert.deepEqual(plain(parse(text)), { kind: 'move', san }));
}

for (const [text, kind] of [['stop', 'stop'], ['stop listening', 'stop'], ['pause', 'stop']]) {
  test(`preserves ${text} control`, () => assert.deepEqual(plain(parse(text)), { kind }));
}

for (const text of [
  '', 'hello', 'help', 'e2e4', 'e two to e four', 'g1f3', 'b1c3', 'b one c three', 'e7e8q', 'knight to f three', 'rook a to e7',
  'echo four', 'knight foxtrot three', 'castle kingside', 'pawn e4', 'e8 promote to queen',
  'move e4', 'please Nf3', 'maybe e4', 'e4 e5', 'b4 e5', 'b four e five', 'b1 c3+',
  'Nf3 and Nc6', 'e4,e5', 'queen', 'knight f3 please',
  'Ne9', 'e0', 'Nf', 'xe4', 'e8K', 'e8=K', 'e4=Q', 'Nf3=Q', 'Nf3++', 'Nf3!', 'O-O-O-O', 'a'.repeat(200),
]) {
  test(`rejects unsupported notation ${JSON.stringify(text.slice(0, 50))}`, () => assert.equal(parse(text), null));
}

const move = (san, from, to, extra = {}) => ({ san, from, to, ...extra });

test('requires native SAN disambiguation rather than picking a knight', () => {
  const moves = [move('Ngf3', 'g1', 'f3'), move('Ndf3', 'd2', 'f3')];
  const result = resolve(parse('Nf3'), moves);
  assert.equal(result.move, undefined);
  assert.match(result.error, /Ngf3 or Ndf3/);
  assert.equal(resolve(parse('knight g f three'), moves).move.from, 'g1');
});

test('requires minimal native disambiguation and allows full-square SAN only when needed', () => {
  assert.equal(resolve(parse('Ng1f3'), [move('Nf3', 'g1', 'f3')]).move, undefined);
  assert.equal(resolve(parse('Ng1f3'), [move('Ng1f3', 'g1', 'f3')]).move.from, 'g1');
  assert.equal(resolve(parse('R1e2'), [move('R1e2', 'e1', 'e2'), move('R3e2', 'e3', 'e2')]).move.from, 'e1');
});

test('rejects moves absent from native legal SAN, including pinned pieces', () => {
  assert.equal(resolve(parse('Nf3'), [move('Ne4', 'd2', 'e4')]).move, undefined);
});

test('requires capture notation and never turns a quiet move into a capture', () => {
  const capture = [move('Qxh7', 'h1', 'h7')];
  assert.equal(resolve(parse('Qh7'), capture).move, undefined);
  assert.equal(resolve(parse('Qxh7'), capture).move.from, 'h1');
  assert.equal(resolve(parse('Qxh7'), [move('Qh7', 'h1', 'h7')]).move, undefined);
});

test('distinguishes bishop B from pawn file b', () => {
  const moves = [move('bxc5', 'b4', 'c5'), move('Bxc5', 'g1', 'c5')];
  assert.equal(resolve(parse('bxc5'), moves).move.from, 'b4');
  assert.equal(resolve(parse('Bxc5'), moves).move.from, 'g1');
  assert.equal(resolve(parse('bishop takes c five'), moves).move.from, 'g1');
});

test('supports native en passant SAN without guessing from an empty destination', () => {
  const moves = [move('exd6', 'e5', 'd6')];
  assert.equal(resolve(parse('e takes d six'), moves).move.from, 'e5');
  assert.equal(resolve(parse('d6'), moves).move, undefined);
});

test('requires explicit queen promotion and supports underpromotion', () => {
  const moves = ['Q', 'R', 'B', 'N'].map(piece => move('e8=' + piece, 'e7', 'e8', { promotion: piece.toLowerCase() }));
  assert.equal(resolve(parse('e8'), moves).move, undefined);
  assert.equal(resolve(parse('e8=Q'), moves).move.promotion, 'q');
  assert.equal(resolve(parse('e8=N'), moves).move.promotion, 'n');
});

test('matches castling SAN for either color', () => {
  const moves = [move('O-O', 'e8', 'g8'), move('O-O-O', 'e8', 'c8')];
  assert.equal(resolve(parse('O O'), moves).move.to, 'g8');
  assert.equal(resolve(parse('O-O-O'), moves).move.to, 'c8');
});

test('permits omitted check or mate, but validates supplied suffixes', () => {
  assert.equal(resolve(parse('Qh7'), [move('Qh7+', 'h1', 'h7')]).move.to, 'h7');
  assert.equal(resolve(parse('Qh7+'), [move('Qh7+', 'h1', 'h7')]).move.to, 'h7');
  assert.equal(resolve(parse('Qh7#'), [move('Qh7+', 'h1', 'h7')]).move, undefined);
  assert.equal(resolve(parse('Qh7+'), [move('Qh7', 'h1', 'h7')]).move, undefined);
  assert.equal(resolve(parse('Qh7'), [move('Qh7#', 'h1', 'h7')]).move.to, 'h7');
  assert.equal(resolve(parse('Qh7#'), [move('Qh7#', 'h1', 'h7')]).move.to, 'h7');
});

test('deduplicates repeated native moves', () => {
  const native = move('Nf3', 'g1', 'f3');
  assert.equal(resolve(parse('Nf3'), [native, native]).move.from, 'g1');
});

test('rejects conflicting native SAN and does not invent missing SAN', () => {
  assert.equal(resolve(parse('Nf3'), [move('Nf3', 'g1', 'f3'), move('Nf3', 'd2', 'f3')]).move, undefined);
  assert.match(resolve(parse('Nf3'), [{ from: 'g1', to: 'f3' }]).error, /does not provide standard move notation/);
  assert.match(resolve(null, []).error, /Use standard notation/);
});
