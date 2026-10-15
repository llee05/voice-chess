/* Spoken SAN and shorthand, resolved only against the board's own legal moves. */
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

  // Shorthand belongs to requests only; the board must still supply complete SAN.
  function readRequest(input) {
    const standard = readSan(input);
    if (standard) return standard;
    const castle = /^castle([+#]?)$/.exec(input);
    if (castle) return { san: input, castle: 'either', suffix: castle[1] };
    const files = /^([a-h])x([a-h])(?:=([QRBN]))?([+#]?)$/.exec(input);
    if (!files) return null;
    return { san: input, piece: 'p', origin: files[1], file: files[2], capture: true, promotion: files[3], suffix: files[4] };
  }

  function parse(transcript) {
    if (typeof transcript !== 'string' || transcript.length > 160) return null;
    const text = transcript.trim().replace(/\.$/, '').trim();
    if (/^(stop|pause|stop listening|pause listening|microphone off)$/i.test(text)) return { kind: 'stop' };
    const castleText = text.toLowerCase().replace(/\s+/g, ' ').replace(/\b(king|queen)[ -]+side\b/g, '$1side');
    const castle = /^(?:castle(?: (kingside|queenside|short|long))?|(kingside|queenside|short|long) castle)(?: ?(checkmate|check mate|check|[+#]))?$/.exec(castleText);
    if (castle) {
      const side = castle[1] ?? castle[2];
      const suffix = words[castle[3]?.replace(' ', '')] ?? castle[3] ?? '';
      return { kind: 'move', san: (side ? (/^(kingside|short)$/.test(side) ? 'O-O' : 'O-O-O') : 'castle') + suffix };
    }
    let notation = text.replace(/check mate/gi, 'checkmate').split(/\s+/)
      .map(token => words[token.toLowerCase()] ?? token).join('');
    // A lowercase b followed by two squares/ranks is a coordinate command or
    // multiple pawn moves, not an instruction to move a rank-disambiguated bishop.
    if (/^b[1-8]x?[a-h][1-8][+#]?$/i.test(notation) && notation[0] === 'b') return null;
    // Dictating O-O produces separate O's rather than spoken hyphens.
    notation = notation.replace(/^([o0]{2,3})([+#]?)$/i, (_, castles, suffix) => Array.from(castles, () => 'O').join('-') + suffix);
    // Keep lowercase b as a pawn file and uppercase B (or "bishop") as a piece.
    if (notation[0] !== 'B') {
      const capture = /^([a-h])x?([a-h])([1-8])?(?:=?([qrbn]))?([+#]?)$/i.exec(notation);
      if (capture) notation = capture[1].toLowerCase() + 'x' + capture[2].toLowerCase() + (capture[3] ?? '') + (capture[4] ? '=' + capture[4].toUpperCase() : '') + capture[5];
    }
    // The piece remains mandatory, but saying "equals" is optional.
    notation = notation.replace(/^([a-h][18])([qrbn])([+#]?)$/i, '$1=$2$3');
    const move = readRequest(notation);
    return move ? { kind: 'move', san: move.san } : null;
  }

  function resolve(command, legalMoves) {
    const requested = readRequest(command?.san ?? '');
    if (!requested) return { error: 'Use standard notation, such as e4, Nf3, or Qxh7.' };
    const native = legalMoves.map(move => ({ move, notation: readSan(move.san ?? '') }));
    if (native.some(entry => !entry.notation)) return { error: 'This board version does not provide standard move notation.' };
    const matches = native.filter(({ notation }) => {
      if (requested.suffix && notation.suffix !== requested.suffix) return false;
      if (requested.castle) return Boolean(notation.castle) && (requested.castle === 'either' || notation.castle === requested.castle);
      return !notation.castle && notation.piece === requested.piece && notation.promotion === requested.promotion &&
        (requested.file ? notation.to[0] === requested.file : notation.to === requested.to) &&
        (!requested.capture || notation.capture);
    });
    let candidates = matches.filter(({ notation }) => notation.origin === requested.origin).map(({ move }) => move);
    // Some board versions repeat the same move in the legal-move collection.
    candidates = candidates.filter((move, index, all) => all.findIndex(other => other.from === move.from && other.to === move.to && other.promotion === move.promotion) === index);
    if (candidates.length === 1) return { move: candidates[0] };
    if (candidates.length > 1) return { error: `Ambiguous move. Use ${[...new Set(candidates.map(move => move.san))].join(' or ')}.` };
    const alternatives = [...new Set(matches.filter(({ move }) => !requested.castle && requested.piece !== 'p' &&
      (!requested.origin || move.from.includes(requested.origin))).map(({ move }) => move.san))];
    if (alternatives.length > 1) return { error: `Ambiguous move. Use ${alternatives.join(' or ')}.` };
    return { error: `No legal move matches ${requested.san}. Use standard notation.` };
  }

  return Object.freeze({ parse, resolve });
})();
