const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const board = load('board.js', 'VoiceChessBoard');
const initial = '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1';

function fixture() {
  let fen = initial;
  const submissions = [];
  const game = {
    getFEN: () => fen,
    getPlayingAs: () => 1,
    getLegalMoves: () => [{ from: 'g1', to: 'f3', san: 'Nf3' }, { from: 'e8', to: 'e7', san: 'Ke7' }],
    move: value => submissions.push(value),
  };
  const element = { game, getBoundingClientRect: () => ({ width: 400, height: 400 }) };
  const doc = { querySelectorAll: () => [element] };
  return { game, element, doc, submissions, setFen: value => { fen = value; } };
}

test('reads types from actual FEN and excludes the other side', () => {
  const position = board.snapshot(fixture().doc);
  assert.equal(position.moves.length, 1);
  assert.equal(position.moves[0].piece, 'n');
  assert.equal(position.moves[0].san, 'Nf3');
});

test('uses the visible initialized board when hidden boards precede it', () => {
  const f = fixture();
  f.doc.querySelectorAll = () => [
    { game: f.game, getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    { getBoundingClientRect: () => ({ width: 400, height: 400 }) },
    f.element,
  ];
  assert.equal(board.findElement(f.doc), f.element);
  assert.equal(board.snapshot(f.doc).element, f.element);
});

test('submits one user move with animation', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  board.play(position, position.moves[0], f.doc);
  assert.equal(f.submissions.length, 1);
  assert.equal(f.submissions[0].userGenerated, true);
  assert.equal(f.submissions[0].from, 'g1');
});

test('rejects a changed position before submitting', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  f.setFen(initial.replace('0 1', '1 2'));
  assert.throws(() => board.play(position, position.moves[0], f.doc), /puzzle changed/);
  assert.equal(f.submissions.length, 0);
});

test('rejects a replaced board, even if its FEN is the same', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  f.element.game = { ...f.game };
  assert.throws(() => board.play(position, position.moves[0], f.doc), /puzzle changed/);
});

test('rejects a replaced element that reuses the same game object', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  f.doc.querySelectorAll = () => [{ ...f.element }];
  assert.throws(() => board.play(position, position.moves[0], f.doc), /puzzle changed/);
  assert.equal(f.submissions.length, 0);
});

test('rechecks legal moves when the FEN has not changed', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  f.game.getLegalMoves = () => [{ from: 'g1', to: 'h3', san: 'Nh3' }];
  assert.throws(() => board.play(position, position.moves[0], f.doc), /move is no longer available/);
  assert.equal(f.submissions.length, 0);
});

test('checks the FEN again after reading current legal moves', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  const getMoves = f.game.getLegalMoves;
  f.game.getLegalMoves = () => { f.setFen(initial.replace('0 1', '1 2')); return getMoves(); };
  assert.throws(() => board.play(position, position.moves[0], f.doc), /puzzle changed/);
  assert.equal(f.submissions.length, 0);
});

test('reports uncertain submission after a board exception without retrying', () => {
  const f = fixture();
  const position = board.snapshot(f.doc);
  f.game.move = value => { f.submissions.push(value); throw new Error('Thrown after dispatch'); };
  assert.equal(board.play(position, position.moves[0], f.doc).uncertain, true);
  assert.equal(f.submissions.length, 1);
});

test('blocks opponent turns', () => {
  const f = fixture();
  f.setFen(initial.replace(' w ', ' b '));
  assert.throws(() => board.snapshot(f.doc), /your turn/);
  const observed = board.observe(f.doc);
  assert.equal(observed.waiting, 'opponent');
  assert.equal(observed.moves[0].san, 'Ke7');
  assert.equal(f.submissions.length, 0);
});

test('does not enable the microphone on the idle Puzzle Rush board', () => {
  const f = fixture();
  f.game.getMode = () => ({ name: 'passive-observing' });
  assert.throws(() => board.snapshot(f.doc), /Start a Puzzle Rush/);
});

test('blocks a finished or unloaded position with no legal moves', () => {
  const f = fixture();
  f.game.getLegalMoves = () => [];
  assert.throws(() => board.snapshot(f.doc), /No moves available/);
});

test('uses Puzzle Rush orientation when the player API is unavailable', () => {
  const f = fixture();
  delete f.game.getPlayingAs;
  f.game.getOptions = () => ({ flipped: true });
  f.setFen(initial.replace(' w ', ' b '));
  assert.equal(board.snapshot(f.doc).moves[0].from, 'e8');
});

test('blocks moves during animation and when input is disabled', () => {
  const f = fixture();
  f.game.isAnimating = () => true;
  assert.throws(() => board.snapshot(f.doc), /board to be ready/);
  f.game.isAnimating = () => false;
  f.game.getOptions = () => ({ enabled: false });
  assert.throws(() => board.snapshot(f.doc), /board to be ready/);
});

test('fails clearly when the API or player side is unavailable', () => {
  assert.throws(() => board.snapshot({ querySelectorAll: () => [] }), /Start a Puzzle Rush/);
  const f = fixture();
  delete f.game.getLegalMoves;
  assert.throws(() => board.snapshot(f.doc), /Start a Puzzle Rush/);
  f.game.getLegalMoves = () => [];
  delete f.game.getPlayingAs;
  assert.throws(() => board.snapshot(f.doc), /puzzle side/);
});

test('preserves native promotion casing', () => {
  const f = fixture();
  f.setFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  f.game.getLegalMoves = () => [{ from: 'a7', to: 'a8', promotion: 'N', san: 'a8=N' }];
  const position = board.snapshot(f.doc);
  assert.equal(position.moves[0].promotion, 'n');
  board.play(position, position.moves[0], f.doc);
  assert.equal(f.submissions[0].promotion, 'N');
});

test('rejects a mutated promotion instead of silently changing the requested piece', () => {
  const f = fixture();
  f.setFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  const raw = { from: 'a7', to: 'a8', promotion: 'N', san: 'a8=N' };
  f.game.getLegalMoves = () => [raw];
  const position = board.snapshot(f.doc);
  raw.promotion = 'Q';
  raw.san = 'a8=Q';
  assert.throws(() => board.play(position, position.moves[0], f.doc), /move is no longer available/);
  assert.equal(f.submissions.length, 0);
});

test('rejects missing or inconsistent native promotion choices', () => {
  for (const move of [
    { from: 'a7', to: 'a8', san: 'a8=N' },
    { from: 'a7', to: 'a8', san: 'a8=N', promotion: 'Q' },
    { from: 'a7', to: 'a8', san: 'a8', promotion: 'N' },
  ]) {
    const f = fixture();
    f.setFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    f.game.getLegalMoves = () => [move];
    assert.throws(() => board.snapshot(f.doc), /consistent promotion choices/);
    assert.equal(f.submissions.length, 0);
  }
});

test('fails clearly for malformed native move collections', () => {
  for (const moves of [null, {}, [null], [42], [{ from: 'z1', to: 'f3', san: 'Nf3' }]]) {
    const f = fixture();
    f.game.getLegalMoves = () => moves;
    assert.throws(() => board.snapshot(f.doc), /board version is not supported/);
  }
});

test('fails clearly when native legal moves lack SAN', () => {
  const f = fixture();
  f.game.getLegalMoves = () => [{ from: 'g1', to: 'f3' }];
  assert.throws(() => board.snapshot(f.doc), /does not provide standard move notation/);
});

test('rejects malformed piece placement', () => {
  for (const fen of ['8/8/8/8', '9/8/8/8/8/8/8/8', '7/8/8/8/8/8/8/8', 'x7/8/8/8/8/8/8/8']) {
    assert.throws(() => board.piecesFromFen(fen), /position is unavailable/);
  }
});
