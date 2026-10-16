const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers.cjs');
const { parse, resolve, resolveAlternatives, vocabulary, queueVocabulary } = load('commands.js', 'VoiceChessCommands');

for (const [text, san] of [
  ['e4', 'e4'], ['e5', 'e5'], ['E4', 'e4'], ['e four', 'e4'], ['e five', 'e5'],
  ['Nf3', 'Nf3'], ['nf3', 'Nf3'], ['N f three', 'Nf3'], ['en f three', 'Nf3'],
  ['knight f for', 'Nf4'], ['night f fore', 'Nf4'], ['e for', 'e4'], ['e too', 'e2'],
  ['queen h to', 'Qh2'], ['rook a won', 'Ra1'], ['e ate queen', 'e8=Q'],
  ['queen takes h for check', 'Qxh4+'], ['e takes d for', 'exd4'],
  ['96', 'Ne6'], ['96.', 'Ne6'], ['96 check', 'Ne6+'], ['91', 'Ne1'], ['98', 'Ne8'],
  ['ninety six', 'Ne6'], ['ninety-six', 'Ne6'], ['ninety-six check mate', 'Ne6#'],
  ['nothing g5', 'Nxg5'], ['Nothing g five.', 'Nxg5'], ['nothing gee five', 'Nxg5'],
  ['nothing g for check', 'Nxg4+'], ['nothing g5 checkmate', 'Nxg5#'],
  ['Knight f three.', 'Nf3'], ['night f3', 'Nf3'], ['Bb5', 'Bb5'],
  ['Qxh7', 'Qxh7'], ['queen takes h seven', 'Qxh7'], ['queen x h7', 'Qxh7'],
  ['quinn h seven', 'Qh7'], ['Quinn H7.', 'Qh7'], ['quinn takes h seven check', 'Qxh7+'],
  ['quinn a h four', 'Qah4'], ['e eight quinn', 'e8=Q'], ['e8 equals quinn', 'e8=Q'],
  ['castle quinn side', 'O-O-O'], ['quinn-side castle check', 'O-O-O+'],
  ['exd5', 'exd5'], ['e takes d five', 'exd5'],
  ['ed5', 'exd5'], ['e d five', 'exd5'], ['dee e five', 'dxe5'],
  ['be5', 'bxe5'], ['bee e five', 'bxe5'], ['Be5', 'Be5'],
  ['de', 'dxe'], ['d e', 'dxe'], ['dee ee', 'dxe'], ['d takes e', 'dxe'], ['dxe', 'dxe'],
  ['ef', 'exf'], ['e f', 'exf'], ['g h', 'gxh'],
  ['bxc5', 'bxc5'], ['Bxc5', 'Bxc5'], ['bishop takes c five', 'Bxc5'], ['B X c five', 'Bxc5'],
  ['Ngf3', 'Ngf3'], ['knight g f three', 'Ngf3'], ['R1e2', 'R1e2'], ['rook one e two', 'R1e2'],
  ['Rae2', 'Rae2'], ['Ng1f3', 'Ng1f3'], ['B4e5', 'B4e5'], ['bishop four e five', 'B4e5'],
  ['O-O', 'O-O'], ['0-0', 'O-O'], ['O O', 'O-O'],
  ['O-O-O', 'O-O-O'], ['zero zero zero', 'O-O-O'],
  ['castle', 'castle'], ['Castle.', 'castle'], ['castle check', 'castle+'],
  ['castle check mate', 'castle#'], ['castle+', 'castle+'],
  ['castle kingside', 'O-O'], ['castle king side', 'O-O'], ['castle king-side', 'O-O'],
  ['kingside castle', 'O-O'], ['short castle', 'O-O'], ['castle short', 'O-O'],
  ['castle queenside', 'O-O-O'], ['queen side castle', 'O-O-O'], ['castle queen-side', 'O-O-O'],
  ['long castle', 'O-O-O'], ['castle long', 'O-O-O'], ['long castle check', 'O-O-O+'],
  ['e8=Q', 'e8=Q'], ['e eight equals queen', 'e8=Q'], ['e8=n', 'e8=N'], ['e eight equals knight', 'e8=N'],
  ['e8Q', 'e8=Q'], ['e eight queen', 'e8=Q'], ['e eight knight check', 'e8=N+'],
  ['de8n', 'dxe8=N'], ['d e eight queen', 'dxe8=Q'], ['axb8r', 'axb8=R'],
  ['deN', 'dxe=N'], ['d e knight', 'dxe=N'], ['d takes e equals queen check', 'dxe=Q+'],
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
  'echo four', 'knight foxtrot three', 'pawn e4', 'e8 promote to queen',
  'move e4', 'please Nf3', 'maybe e4', 'e4 e5', 'b4 e5', 'b four e five', 'b1 c3+',
  'Nf3 and Nc6', 'e4,e5', 'queen', 'knight f3 please',
  'Ne9', 'e0', 'Nf', 'xe4', 'e8K', 'e8=K', 'e4=Q', 'Nf3=Q', 'Nf3++', 'Nf3!', 'O-O-O-O', 'a'.repeat(200),
  'castle both sides', 'castle king', 'please castle', 'castle++',
  'de0', 'de9', 'de5Q', 'deK', 'dxe=K', 'Bxe', 'e4Q', 'de e4', 'de ed',
  'before', 'knight before', 'rook a to e seven', 'e to e for', 'knight for e two', 'e for e five',
  '9', '90', '99', '960', '196', '9.6', '96 e4', 'please 96', 'ninety sixty', 'nineteen six',
  'nothing', 'nothing to g5', 'nothing g5 please', 'nothing g5 h7', 'do nothing g5', 'something g5', 'nothing castle',
  'quinn', 'quinn to h7', 'quinn h7 please', 'quinn h7 quinn e4', 'quinnish h7', 'quinnh7', 'e4 quinn',
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

test('allows omitted piece capture markers but respects explicit captures', () => {
  const capture = [move('Qxh7', 'h1', 'h7')];
  assert.equal(resolve(parse('Qh7'), capture).move.from, 'h1');
  assert.equal(resolve(parse('queen h seven'), capture).move.from, 'h1');
  assert.equal(resolve(parse('Qxh7'), capture).move.from, 'h1');
  assert.equal(resolve(parse('Qxh7'), [move('Qh7', 'h1', 'h7')]).move, undefined);
});

test('requires disambiguation for captures with an omitted marker', () => {
  const moves = [move('Ngxf3', 'g1', 'f3'), move('Ndxf3', 'd2', 'f3')];
  assert.match(resolve(parse('Nf3'), moves).error, /Ngxf3 or Ndxf3/);
  assert.equal(resolve(parse('Ngf3'), moves).move.from, 'g1');
});

test('does not prefer an exact quiet spelling over other matching moves', () => {
  const result = resolve(parse('Qh7'), [move('Qh7', 'h1', 'h7'), move('Qxh7', 'a7', 'h7')]);
  assert.equal(result.move, undefined);
  assert.match(result.error, /Qh7 or Qxh7/);
});

test('distinguishes bishop B from pawn file b', () => {
  const moves = [move('bxc5', 'b4', 'c5'), move('Bxc5', 'g1', 'c5')];
  assert.equal(resolve(parse('bxc5'), moves).move.from, 'b4');
  assert.equal(resolve(parse('Bxc5'), moves).move.from, 'g1');
  assert.equal(resolve(parse('bishop takes c five'), moves).move.from, 'g1');
  assert.equal(resolve(parse('bc5'), moves).move.from, 'b4');
  assert.equal(resolve(parse('b c'), moves).move.from, 'b4');
  assert.equal(resolve(parse('Bc5'), moves).move.from, 'g1');
  assert.equal(resolve(parse('bishop c five'), moves).move.from, 'g1');
});

test('resolves pawn captures with omitted takes or destination rank', () => {
  const moves = [move('dxe5', 'd4', 'e5'), move('dxc5', 'd4', 'c5'), move('exd5', 'e4', 'd5')];
  for (const text of ['de', 'd e', 'd takes e', 'dxe', 'de5', 'd e five']) {
    assert.equal(resolve(parse(text), moves).move.san, 'dxe5');
  }
  assert.equal(resolve(parse('ed'), moves).move.san, 'exd5');
  assert.equal(resolve(parse('dc'), moves).move.san, 'dxc5');
  assert.equal(resolve(parse('de'), [move('e5', 'e4', 'e5')]).move, undefined);
  assert.equal(resolve(parse('e5'), moves).move, undefined);
});

test('rankless pawn captures report every matching legal SAN without choosing a rank', () => {
  const moves = [move('dxe5', 'd4', 'e5'), move('dxe3', 'd2', 'e3')];
  const result = resolve(parse('de'), moves);
  assert.equal(result.move, undefined);
  assert.match(result.error, /dxe5 or dxe3/);
  assert.equal(resolve(parse('de5'), moves).move.from, 'd4');
  assert.equal(resolve(parse('de3'), moves).move.from, 'd2');
});

test('supports native en passant SAN without guessing from an empty destination', () => {
  const moves = [move('exd6', 'e5', 'd6')];
  assert.equal(resolve(parse('e takes d six'), moves).move.from, 'e5');
  assert.equal(resolve(parse('ed6'), moves).move.from, 'e5');
  assert.equal(resolve(parse('ed'), moves).move.from, 'e5');
  assert.equal(resolve(parse('d6'), moves).move, undefined);
});

test('requires explicit queen promotion and supports underpromotion', () => {
  const moves = ['Q', 'R', 'B', 'N'].map(piece => move('e8=' + piece, 'e7', 'e8', { promotion: piece.toLowerCase() }));
  assert.equal(resolve(parse('e8'), moves).move, undefined);
  assert.equal(resolve(parse('e8=Q'), moves).move.promotion, 'q');
  assert.equal(resolve(parse('e8=N'), moves).move.promotion, 'n');
  assert.equal(resolve(parse('e8Q'), moves).move.promotion, 'q');
  assert.equal(resolve(parse('e eight knight'), moves).move.promotion, 'n');
});

test('rankless captures require explicit promotion and preserve the requested piece', () => {
  const moves = ['Q', 'R', 'B', 'N'].map(piece => move('dxe8=' + piece, 'd7', 'e8', { promotion: piece.toLowerCase() }));
  assert.equal(resolve(parse('de'), moves).move, undefined);
  assert.equal(resolve(parse('de8'), moves).move, undefined);
  assert.equal(resolve(parse('deQ'), moves).move.promotion, 'q');
  assert.equal(resolve(parse('d e knight'), moves).move.promotion, 'n');
  assert.equal(resolve(parse('d e eight rook'), moves).move.promotion, 'r');
});

test('matches castling SAN for either color', () => {
  const moves = [move('O-O', 'e8', 'g8'), move('O-O-O', 'e8', 'c8')];
  assert.equal(resolve(parse('O O'), moves).move.to, 'g8');
  assert.equal(resolve(parse('O-O-O'), moves).move.to, 'c8');
  assert.equal(resolve(parse('short castle'), moves).move.to, 'g8');
  assert.equal(resolve(parse('castle queen side'), moves).move.to, 'c8');
});

test('bare castle requires a single legal castling move', () => {
  const king = move('O-O', 'e1', 'g1');
  const queen = move('O-O-O', 'e1', 'c1');
  assert.equal(resolve(parse('castle'), [king]).move.to, 'g1');
  assert.equal(resolve(parse('castle'), [queen]).move.to, 'c1');
  const result = resolve(parse('castle'), [king, queen]);
  assert.equal(result.move, undefined);
  assert.match(result.error, /O-O or O-O-O/);
  assert.equal(resolve(parse('castle'), [move('Kf1', 'e1', 'f1')]).move, undefined);
  assert.equal(resolve(parse('castle long'), [king]).move, undefined);
});

test('validates supplied check or mate suffixes on shorthand', () => {
  assert.equal(resolve(parse('Qh7+'), [move('Qxh7+', 'h1', 'h7')]).move.to, 'h7');
  assert.equal(resolve(parse('Qh7#'), [move('Qxh7+', 'h1', 'h7')]).move, undefined);
  const captures = [move('dxe5+', 'd4', 'e5'), move('dxe3', 'd2', 'e3')];
  assert.equal(resolve(parse('de check'), captures).move.to, 'e5');
  assert.equal(resolve(parse('de checkmate'), captures).move, undefined);
  assert.equal(resolve(parse('castle check'), [move('O-O+', 'e1', 'g1')]).move.to, 'g1');
  assert.equal(resolve(parse('castle checkmate'), [move('O-O+', 'e1', 'g1')]).move, undefined);
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
  const capture = move('dxe5', 'd4', 'e5');
  assert.equal(resolve(parse('de'), [capture, capture]).move.from, 'd4');
  const castle = move('O-O', 'e1', 'g1');
  assert.equal(resolve(parse('castle'), [castle, castle]).move.to, 'g1');
});

test('rejects conflicting native SAN and does not invent missing SAN', () => {
  assert.equal(resolve(parse('Nf3'), [move('Nf3', 'g1', 'f3'), move('Nf3', 'd2', 'f3')]).move, undefined);
  assert.match(resolve(parse('Nf3'), [{ from: 'g1', to: 'f3' }]).error, /does not provide standard move notation/);
  assert.match(resolve(null, []).error, /Use standard notation/);
  assert.match(resolve(parse('de'), [move('de', 'd4', 'e5')]).error, /does not provide standard move notation/);
  assert.match(resolve(parse('castle'), [move('castle', 'e1', 'g1')]).error, /does not provide standard move notation/);
});

test('recovers a unique legal move from an alternative transcript', () => {
  const moves = [move('Nf3', 'g1', 'f3')];
  const result = resolveAlternatives(['nice f tree', 'knight f three'], moves);
  assert.equal(result.move, moves[0]);
  assert.equal(result.transcript, 'knight f three');
});

test('different spellings of the same move agree, including shorthand and homophones', () => {
  const moves = [move('Qxh4+', 'h1', 'h4')];
  const result = resolveAlternatives(['queen h for', 'Qxh4', 'queen takes h four'], moves);
  assert.equal(result.move, moves[0]);
  assert.equal(result.transcript, 'queen h for');
});

test('conflicting legal transcripts require repetition rather than picking the first', () => {
  const result = resolveAlternatives(['e four', 'd four'], [move('e4', 'e2', 'e4'), move('d4', 'd2', 'd4')]);
  assert.equal(result.move, undefined);
  assert.match(result.error, /e4 or d4/);
});

test('a disambiguated alternative cannot override an ambiguous transcript', () => {
  const moves = [move('Ngf3', 'g1', 'f3'), move('Ndf3', 'd2', 'f3')];
  for (const transcripts of [['Nf3', 'Ngf3'], ['Ngf3', 'Nf3']]) {
    const result = resolveAlternatives(transcripts, moves);
    assert.equal(result.move, undefined);
    assert.match(result.error, /Ngf3 or Ndf3/);
  }
});

test('alternative castling and pawn shorthand preserve every ambiguous move', () => {
  for (const [transcripts, moves] of [
    [['castle short', 'castle'], [move('O-O', 'e1', 'g1'), move('O-O-O', 'e1', 'c1')]],
    [['de5', 'de'], [move('dxe5', 'd4', 'e5'), move('dxe3', 'd2', 'e3')]],
  ]) assert.equal(resolveAlternatives(transcripts, moves).move, undefined);
});

test('alternatives cannot invent legality, fill in a promotion piece, or change explicit takes', () => {
  assert.equal(resolveAlternatives(['Nf3', 'night f three'], [move('Ne4', 'd2', 'e4')]).move, undefined);
  assert.equal(resolveAlternatives(['e8', 'e eight'], [move('e8=Q', 'e7', 'e8', { promotion: 'q' })]).move, undefined);
  assert.equal(resolveAlternatives(['queen takes h four'], [move('Qh4', 'h1', 'h4')]).move, undefined);
  assert.equal(resolveAlternatives(['e4 e5'], [move('e4', 'e2', 'e4')]).move, undefined);
  assert.match(resolveAlternatives(['e4'], [{ from: 'e2', to: 'e4' }]).error, /does not provide standard move notation/);
});

test('conflicting promotion alternatives never default to a queen', () => {
  const moves = ['Q', 'N'].map(piece => move('e8=' + piece, 'e7', 'e8', { promotion: piece.toLowerCase() }));
  const result = resolveAlternatives(['e8Q', 'e8N'], moves);
  assert.equal(result.move, undefined);
  assert.match(result.error, /e8=Q or e8=N/);
});

test('repairs reported knight mishearings only when the requested native move exists', () => {
  const quiet = move('Ne6', 'f4', 'e6');
  const capture = move('Nxg5', 'e4', 'g5');
  assert.equal(resolveAlternatives(['96'], [quiet]).move, quiet);
  assert.equal(resolveAlternatives(['ninety-six', 'knight e six'], [quiet]).move, quiet);
  assert.equal(resolveAlternatives(['nothing g5', 'knight takes g5'], [capture]).move, capture);
  assert.equal(resolveAlternatives(['96'], [move('Nd6', 'f5', 'd6')]).move, undefined);
  assert.equal(resolveAlternatives(['nothing g5'], [move('Ng5', 'e4', 'g5')]).move, undefined);
  assert.equal(resolveAlternatives(['96 checkmate'], [move('Ne6+', 'f4', 'e6')]).move, undefined);
});

test('repaired knight transcripts preserve source ambiguity and alternative conflicts', () => {
  for (const [text, moves, choices] of [
    ['96', [move('Nfe6', 'f4', 'e6'), move('Nce6', 'c5', 'e6')], /Nfe6 or Nce6/],
    ['nothing g5', [move('Nexg5', 'e4', 'g5'), move('Nfxg5', 'f3', 'g5')], /Nexg5 or Nfxg5/],
  ]) {
    const result = resolveAlternatives([text], moves);
    assert.equal(result.move, undefined);
    assert.match(result.error, choices);
  }
  const result = resolveAlternatives(['nothing g5', 'knight takes e5'], [move('Nxg5', 'e4', 'g5'), move('Nxe5', 'f3', 'e5')]);
  assert.equal(result.move, undefined);
  assert.match(result.error, /Nxg5 or Nxe5/);
});

test('quinn repairs still validate captures, check suffixes, and explicit promotion choices', () => {
  const capture = move('Qxh7+', 'h1', 'h7');
  assert.equal(resolveAlternatives(['quinn h seven', 'queen h seven'], [capture]).move, capture);
  assert.equal(resolve(parse('quinn takes h seven check'), [capture]).move, capture);
  assert.equal(resolve(parse('quinn h seven checkmate'), [capture]).move, undefined);
  assert.equal(resolve(parse('quinn takes h seven'), [move('Qh7', 'h1', 'h7')]).move, undefined);
  const promotions = ['Q', 'N'].map(piece => move('e8=' + piece, 'e7', 'e8', { promotion: piece.toLowerCase() }));
  assert.equal(resolve(parse('e eight quinn'), promotions).move.promotion, 'q');
});

test('quinn does not choose between ambiguous queens', () => {
  const moves = [move('Qah4', 'a4', 'h4'), move('Qeh4', 'e1', 'h4')];
  const result = resolveAlternatives(['quinn h four', 'quinn a h four'], moves);
  assert.equal(result.move, undefined);
  assert.match(result.error, /Qah4 or Qeh4/);
  assert.equal(resolve(parse('quinn a h four'), moves).move.from, 'a4');
});

test('spoken grammar includes legal moves and guards against invented disambiguation or promotion', () => {
  const moves = [move('Ngf3', 'g1', 'f3'), move('Ndf3', 'd2', 'f3'), move('exd5', 'e4', 'd5'),
    move('e8=N', 'e7', 'e8', { promotion: 'n' }), move('Bxe5+', 'b2', 'e5'),
    move('O-O', 'e1', 'g1'), move('O-O-O', 'e1', 'c1')];
  const phrases = vocabulary(moves);
  for (const phrase of ['knight g f three', 'knight d f three', 'e takes d five', 'e d five', 'e d',
    'e eight equals knight', 'e eight knight', 'bishop takes e five check', 'short castle', 'castle queen side', 'stop']) {
    assert.ok(phrases.includes(phrase), `Missing phrase: ${phrase}`);
    const command = parse(phrase);
    assert.ok(command.kind === 'stop' || resolve(command, moves).move);
  }
  for (const phrase of ['knight f three', 'e eight', 'castle']) {
    assert.ok(phrases.includes(phrase));
    assert.ok(resolve(parse(phrase), moves).error, `Guard must not select a move: ${phrase}`);
  }
  assert.equal(phrases.includes('queen h seven'), false);
  assert.ok(phrases.every(phrase => /^[a-z]+(?: [a-z]+)*$/.test(phrase)), 'Vosk receives words, not compact SAN');
  assert.equal(new Set(phrases).size, phrases.length);
});

test('ambiguous pawn shorthand and missing promotion pieces remain recognizable but rejected', () => {
  const ambiguous = [move('dxe5', 'd4', 'e5'), move('dxe3', 'd2', 'e3')];
  assert.ok(vocabulary(ambiguous).includes('d e'));
  assert.ok(resolve(parse('d e'), ambiguous).error);
  const promotions = ['Q', 'N'].map(piece => move('axb8=' + piece, 'a7', 'b8', { promotion: piece.toLowerCase() }));
  for (const phrase of ['a b queen', 'a b knight', 'a b']) assert.ok(vocabulary(promotions).includes(phrase));
  assert.ok(resolve(parse('a b'), promotions).error);
  const quiet = [move('Ng5', 'e4', 'g5')];
  assert.ok(vocabulary(quiet).includes('knight takes g five'));
  assert.ok(resolve(parse('knight takes g five'), quiet).error);
});

test('spoken vocabulary preserves check on castling and uses separate mate words', () => {
  const moves = [move('O-O+', 'e1', 'g1'), move('Qxh7#', 'h1', 'h7')];
  for (const phrase of ['castle check', 'short castle check', 'castle king side check', 'queen h seven check mate']) {
    assert.ok(vocabulary(moves).includes(phrase));
    assert.ok(resolve(parse(phrase), moves).move);
  }
});

test('missing or nonstandard legal SAN produces only queue and microphone controls, without invented hints', () => {
  const controls = Array.from(vocabulary([]));
  assert.ok(controls.length > 0);
  assert.ok(controls.every(phrase => ['stop', 'clearQueue'].includes(parse(phrase).kind)));
  assert.deepEqual(Array.from(vocabulary([{ from: 'g1', to: 'f3' }])), controls);
  assert.deepEqual(Array.from(vocabulary([move('96', 'f4', 'e6')])), controls);
});

test('explicit queue commands and then-separated moves preserve requested order', () => {
  for (const text of ['queue Nf3 then Bc4', 'premove knight f three then bishop c four', 'knight f three then bishop c four']) {
    assert.deepEqual(plain(parse(text)), { kind: 'queue', moves: [{ kind: 'move', san: 'Nf3' }, { kind: 'move', san: 'Bc4' }] });
  }
  assert.deepEqual(plain(parse('queue e8 knight')), { kind: 'queue', moves: [{ kind: 'move', san: 'e8=N' }] });
  assert.deepEqual(plain(parse('castle then d e')), { kind: 'queue', moves: [{ kind: 'move', san: 'castle' }, { kind: 'move', san: 'dxe' }] });
  for (const text of ['clear queue', 'cancel queue']) assert.equal(parse(text).kind, 'clearQueue');
});

test('rejects an entire malformed or oversized chain before executing any part', () => {
  for (const text of ['queue', 'premove', 'queue stop', 'queue clear queue', 'queue queue e4', 'e4 then', 'then e4',
    'e4 then then Nf3', 'e4 then please Nf3', 'e4 then e2e4', 'e4 and Nf3', 'e4, Nf3',
    'e4 then queue Nf3', 'e4 then stop', Array(7).fill('e4').join(' then ')]) {
    assert.equal(parse(text), null, text);
  }
  assert.equal(parse(Array(6).fill('e4').join(' then ')).moves.length, 6);
  const phrases = queueVocabulary();
  assert.ok(phrases.length < 3000);
  assert.ok(phrases.every(phrase => phrase.length <= 160 && /^[a-z]+(?: [a-z]+)*$/.test(phrase)));
  for (const phrase of ['then knight f three', 'queue queen f three', 'premove castle', 'g three', 'rook one a one', 'e eight knight', 'three then']) assert.ok(phrases.includes(phrase));
});
