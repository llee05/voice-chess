/* Spoken SAN normalization and matching against the board's own move notation. */
const VoiceChessCommands = (() => {
  const words = {
    king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', night: 'N',
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
    ay: 'a', bee: 'b', see: 'c', sea: 'c', dee: 'd', ee: 'e', eff: 'f', gee: 'g', aitch: 'h',
    en: 'N', cue: 'Q', kay: 'K',
    takes: 'x', captures: 'x', equals: '=', check: '+', checkmate: '#',
    zero: 'O', oh: 'O',
  };

  function readSan(input) {
    if (typeof input !== 'string') return null;
    if (/^[o0]-[o0](?:-[o0])?[+#]?$/i.test(input)) {
      const suffix = /[+#]$/.exec(input)?.[0] ?? '';
      return { san: input.replace(/[o0]/gi, 'O'), piece: 'k', castle: input.split('-').length === 3 ? 'queen' : 'king', suffix };
    }
    // Capital B is a bishop; lowercase b in bxd5 is the pawn's file.
    const pawn = input[0] === 'B' && /x/i.test(input[1] ?? '') ? null : /^(?:([a-h])x)?([a-h][1-8])(?:=([qrbn]))?([+#])?$/i.exec(input);
    if (pawn) {
      const origin = pawn[1]?.toLowerCase();
      const to = pawn[2].toLowerCase();
      const promotion = pawn[3]?.toUpperCase();
      if (promotion && !/[18]$/.test(to)) return null;
      const suffix = pawn[4] ?? '';
      return { san: (origin ? origin + 'x' : '') + to + (promotion ? '=' + promotion : '') + suffix, piece: 'p', to, origin, capture: Boolean(origin), promotion, suffix };
    }
    const piece = /^([kqrnb])([a-h][1-8]?|[1-8])?(x?)([a-h][1-8])([+#])?$/i.exec(input);
    if (!piece) return null;
    const type = piece[1].toUpperCase();
    const origin = piece[2]?.toLowerCase();
    const to = piece[4].toLowerCase();
    const suffix = piece[5] ?? '';
    return { san: type + (origin ?? '') + piece[3].toLowerCase() + to + suffix, piece: type.toLowerCase(), to, origin, capture: Boolean(piece[3]), suffix };
  }

  function parse(transcript) {
    if (typeof transcript !== 'string' || transcript.length > 160) return null;
    const text = transcript.trim().replace(/\.$/, '').trim();
    if (/^(stop|pause|stop listening|pause listening|microphone off)$/i.test(text)) return { kind: 'stop' };
    if (/^help$/i.test(text)) return { kind: 'help' };
    let notation = text.replace(/check mate/gi, 'checkmate').split(/\s+/)
      .map(token => words[token.toLowerCase()] ?? token).join('');
    // A lowercase b followed by two squares/ranks is a coordinate command or
    // multiple pawn moves, not an instruction to move a rank-disambiguated bishop.
    if (/^b[1-8]x?[a-h][1-8][+#]?$/i.test(notation) && notation[0] === 'b') return null;
    // Dictating O-O produces separate O's rather than spoken hyphens.
    notation = notation.replace(/^([o0]{2,3})([+#]?)$/i, (_, castles, suffix) => Array.from(castles, () => 'O').join('-') + suffix);
    const move = readSan(notation);
    return move ? { kind: 'move', san: move.san } : null;
  }

  function resolve(command, legalMoves) {
    const requested = readSan(command?.san ?? '');
    if (!requested) return { error: 'Use standard notation, such as e4, Nf3, or Qxh7.' };
    if (legalMoves.some(move => !readSan(move.san ?? ''))) return { error: 'This board version does not provide standard move notation.' };
    const core = san => san.replace(/[+#]$/, '');
    let candidates = legalMoves.filter(move => requested.suffix ? move.san === requested.san : core(move.san) === requested.san);
    // Some board versions repeat the same move in the legal-move collection.
    candidates = candidates.filter((move, index, all) => all.findIndex(other => other.from === move.from && other.to === move.to && other.promotion === move.promotion) === index);
    if (candidates.length === 1) return { move: candidates[0] };
    if (candidates.length > 1) return { error: 'Ambiguous move. Use disambiguated standard notation.' };
    const alternatives = [...new Set(legalMoves.filter(move => {
      const native = readSan(move.san);
      return !requested.castle && native.piece === requested.piece && native.to === requested.to && native.capture === requested.capture && native.promotion === requested.promotion &&
        (!requested.origin || move.from.includes(requested.origin));
    }).map(move => move.san))];
    if (alternatives.length > 1) return { error: `Ambiguous move. Use ${alternatives.join(' or ')}.` };
    return { error: `No legal move matches ${requested.san}. Use standard notation.` };
  }

  return Object.freeze({ parse, resolve });
})();
