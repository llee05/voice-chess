const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const Submission = load('submission.js', 'VoiceChessSubmission');

function fixture(options = {}) {
  let time = 0;
  const sent = [], statuses = [];
  const knight = { san: 'Nf3', from: 'g1', to: 'f3' };
  const bishop = { san: 'Bc4', from: 'f1', to: 'c4' };
  let position = { element: {}, game: {}, fen: 'start', moves: [knight, bishop] };
  const submission = new Submission({
    read: () => position,
    play(pos, move) { sent.push({ pos, move }); return options.uncertain ? { uncertain: true } : undefined; },
    now: () => time, onStatus: message => statuses.push(message),
  });
  return { submission, sent, statuses, knight, bishop,
    advance(changes) { position = { ...position, ...changes }; submission.tick(); },
    time(value) { time = value; submission.tick(); },
    get position() { return position; },
  };
}

test('dispatches one move and blocks all further commands while it is pending', () => {
  const f = fixture(); f.submission.send(f.position, f.knight);
  assert.equal(f.sent.length, 1);
  assert.equal(f.statuses.at(-1), 'Sent Nf3');
  for (const move of [f.knight, f.bishop]) {
    assert.throws(() => f.submission.send(f.position, move), /Wait for the board/);
  }
  f.submission.tick();
  assert.equal(f.sent.length, 1);
  f.advance({ fen: 'after knight' });
  f.advance({ fen: 'after reply' });
  assert.equal(f.submission.pending, null);
  assert.equal(f.sent.length, 1, 'Blocked commands must never become premoves');
  f.submission.send(f.position, f.bishop);
  assert.equal(f.sent.length, 2, 'A new command can submit after the position changes');
});

test('rejected and uncertain attempts are not replayed or resent on the same position', () => {
  for (const uncertain of [false, true]) {
    const f = fixture({ uncertain }); f.submission.send(f.position, f.knight);
    f.time(601);
    assert.match(f.statuses.at(-1), uncertain ? /Board rejected/ : /Board did not change/);
    f.submission.tick();
    assert.throws(() => f.submission.send(f.position, { ...f.knight }), /Already sent/);
    assert.equal(f.sent.length, 1);
  }
});

test('a position change confirms an uncertain attempt without sending another move', () => {
  const f = fixture({ uncertain: true }); f.submission.send(f.position, f.knight);
  assert.match(f.statuses.at(-1), /Could not confirm/);
  f.advance({ fen: 'after knight' }); f.time(601);
  assert.equal(f.submission.pending, null);
  assert.equal(f.statuses.at(-1), 'Sent Nf3');
  assert.equal(f.sent.length, 1);
});

test('board replacement releases pending state and scopes duplicate protection to the board', () => {
  for (const changes of [{ element: {} }, { game: {} }]) {
    const f = fixture(); f.submission.send(f.position, f.knight);
    f.advance(changes);
    assert.equal(f.submission.pending, null);
    f.submission.send(f.position, f.knight);
    assert.equal(f.sent.length, 2);
  }
});

test('validation failures before dispatch do not consume the request', () => {
  const f = fixture(); const play = f.submission.play;
  f.submission.play = () => { throw new Error('The puzzle changed.'); };
  assert.throws(() => f.submission.send(f.position, f.knight), /puzzle changed/);
  assert.equal(f.submission.pending, null);
  assert.equal(f.sent.length, 0);
  f.submission.play = play;
  f.submission.send(f.position, f.knight);
  assert.equal(f.sent.length, 1);
});

test('stopping or losing the board discards tracking without replaying an attempt', () => {
  for (const failure of ['stop', 'unavailable']) {
    const f = fixture(); f.submission.send(f.position, f.knight);
    if (failure === 'stop') f.submission.reset();
    else f.submission.read = () => { throw new Error('Start a Puzzle Rush.'); };
    f.submission.tick(); f.time(601);
    assert.equal(f.submission.pending, null);
    assert.equal(f.sent.length, 1);
  }
});
