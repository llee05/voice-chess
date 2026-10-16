const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const Queue = load('queue.js', 'VoiceChessQueue');
const { parse, resolve } = load('commands.js', 'VoiceChessCommands');

function fixture() {
  let time = 0;
  const element = {}, game = {}, sent = [], statuses = [], shown = [];
  const knight = { san: 'Nf3', from: 'g1', to: 'f3' };
  const bishop = { san: 'Bc4', from: 'f1', to: 'c4' };
  let position = { element, game, fen: 'start', player: 'w', turn: 'w', waiting: null, moves: [knight] };
  const queue = new Queue({
    read: () => position, resolve,
    follows: (before, after, expected) => after.previous === before.fen && (!expected || after.lastMove === expected),
    play(pos, move) { sent.push({ pos, move }); }, now: () => time,
    onStatus: message => statuses.push(message), onQueue: moves => shown.push(Array.from(moves, move => move.san)),
  });
  return { queue, sent, statuses, shown, knight, bishop,
    append: text => queue.append(parse(text).moves),
    advance(changes) { position = { ...position, ...changes }; queue.tick(); },
    time(value) { time = value; queue.tick(); },
    get position() { return position; },
  };
}

test('chains requested moves across a confirmed move and opponent reply', () => {
  const f = fixture(); f.append('Nf3 then Bc4');
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.shown.at(-1), ['Bc4']);
  f.queue.tick(); assert.equal(f.sent.length, 1);
  f.advance({ fen: 'after knight', previous: 'start', lastMove: f.knight, turn: 'b', waiting: 'opponent', moves: [{ san: 'e5' }] });
  assert.equal(f.sent.length, 1);
  f.advance({ fen: 'after reply', previous: 'after knight', turn: 'w', waiting: 'animation', moves: [f.bishop] });
  assert.equal(f.sent.length, 1);
  f.advance({ waiting: null });
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].move, f.bishop);
  f.queue.tick(); assert.equal(f.sent.length, 2);
});

test('explicit premoves can be appended on the opponent turn', () => {
  const f = fixture();
  f.advance({ turn: 'b', waiting: 'opponent', moves: [{ san: 'e5' }] });
  f.append('queue Nf3');
  assert.equal(f.sent.length, 0);
  f.append('premove Bc4');
  assert.deepEqual(f.shown.at(-1), ['Nf3', 'Bc4']);
  f.advance({ fen: 'reply', previous: 'start', turn: 'w', waiting: null, moves: [f.knight] });
  assert.equal(f.sent[0].move, f.knight);
});

test('an illegal or ambiguous next move clears the rest without choosing a piece', () => {
  for (const moves of [[{ san: 'Bb5', from: 'f1', to: 'b5' }], [
    { san: 'Bfc4', from: 'f1', to: 'c4' }, { san: 'Bec4', from: 'e2', to: 'c4' },
  ]]) {
    const f = fixture(); f.advance({ moves }); f.append('queue Bc4 then Nf3');
    assert.equal(f.sent.length, 0);
    assert.equal(f.queue.moves.length, 0);
    assert.match(f.statuses.at(-1), /Queue cleared/);
    f.advance({ moves }); // New legal moves never revive the rejected queue.
    assert.equal(f.sent.length, 0);
  }
});

test('never fills in a missing promotion piece', () => {
  const f = fixture();
  f.advance({ moves: [{ san: 'e8=Q', from: 'e7', to: 'e8', promotion: 'q' }] });
  f.append('queue e8');
  assert.equal(f.sent.length, 0);
  f.append('queue e8 knight');
  assert.equal(f.sent.length, 0);
  f.append('queue e8 queen');
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].move.promotion, 'q');
});

test('clear and reset discard future moves and never replay a pending submission', () => {
  for (const method of ['clear', 'reset']) {
    const f = fixture(); f.append('Nf3 then Bc4'); f.queue[method]();
    f.advance({ fen: 'after knight', previous: 'start', lastMove: f.knight, turn: 'b', waiting: 'opponent' });
    f.advance({ fen: 'reply', previous: 'after knight', turn: 'w', waiting: null, moves: [f.bishop] });
    assert.equal(f.sent.length, 1);
    assert.equal(f.queue.moves.length, 0);
  }
});

test('rejected and uncertain submissions clear future moves and are never retried', () => {
  for (const uncertain of [false, true]) {
    const f = fixture();
    f.queue.play = (pos, move) => { f.sent.push({ pos, move }); return uncertain ? { uncertain: true } : undefined; };
    f.append('Nf3 then Bc4'); f.time(601);
    assert.equal(f.queue.moves.length, 0);
    f.queue.tick();
    assert.equal(f.sent.length, 1);
    assert.throws(() => f.queue.send(f.position, f.knight), /Already sent/);
  }
});

test('puzzle resets, replacements, disabled input and skipped positions cancel queued moves', () => {
  for (const changes of [{ fen: 'new puzzle' }, { element: {} }, { game: {} }, { player: 'b' }, { waiting: 'disabled' }, { moves: [] }]) {
    const f = fixture(); f.append('Nf3 then Bc4'); f.advance(changes);
    assert.equal(f.queue.moves.length, 0);
    assert.equal(f.sent.length, 1);
    assert.match(f.statuses.at(-1), /Queue cleared/);
  }
});

test('a manual move does not advance a queued plan waiting for animation', () => {
  const f = fixture(); f.advance({ waiting: 'animation' }); f.append('queue Nf3');
  f.advance({ fen: 'manual move', previous: 'start', turn: 'b', waiting: 'opponent' });
  assert.equal(f.sent.length, 0);
  assert.equal(f.queue.moves.length, 0);
});

test('queue capacity and expiry bound pending commands', () => {
  const f = fixture(); f.advance({ turn: 'b', waiting: 'opponent' });
  f.append('queue Nf3 then Bc4 then e4 then e5 then d4 then d5');
  f.append('queue a4');
  assert.equal(f.queue.moves.length, 6);
  assert.match(f.statuses.at(-1), /Queue full/);
  f.time(15000);
  assert.equal(f.queue.moves.length, 0);
  assert.equal(f.sent.length, 0);
  assert.match(f.statuses.at(-1), /expired/);
});
