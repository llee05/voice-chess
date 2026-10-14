/* Pure speech parsing and selection from the board's own legal moves. */
const VoiceChessCommands = (() => {
  const files = {
    a: 'a', ay: 'a', alpha: 'a', alfa: 'a',
    b: 'b', be: 'b', bee: 'b', bravo: 'b',
    c: 'c', see: 'c', sea: 'c', charlie: 'c',
    d: 'd', dee: 'd', delta: 'd',
    e: 'e', ee: 'e', echo: 'e',
    f: 'f', eff: 'f', foxtrot: 'f',
    g: 'g', gee: 'g', golf: 'g',
    h: 'h', aitch: 'h', haitch: 'h', hotel: 'h',
  };
  const ranks = {
    one: '1', won: '1', two: '2', too: '2', to: '2', three: '3', tree: '3',
    four: '4', for: '4', fore: '4', five: '5', six: '6', seven: '7', eight: '8', ate: '8',
  };
  const pieces = { pawn: 'p', knight: 'n', night: 'n', bishop: 'b', rook: 'r', rock: 'r', queen: 'q', king: 'k' };
  const promotionPieces = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n', night: 'n', q: 'q', r: 'r', b: 'b', n: 'n' };
  const connectors = new Set(['to', 'takes', 'take', 'captures', 'capture', 'x']);

  function square(tokens, index) {
    const file = files[tokens[index]];
    const token = tokens[index + 1];
    const rank = /^[1-8]$/.test(token ?? '') ? token : ranks[token];
    return file && rank ? { value: file + rank, end: index + 2 } : null;
  }

  function parse(transcript) {
    if (typeof transcript !== 'string' || transcript.length > 160) return null;
    let text = transcript.toLowerCase().trim().replace(/[.,!?+#]/g, '').replace(/\s+/g, ' ');
    if (/^(stop|pause|stop listening|pause listening|microphone off)$/.test(text)) return { kind: 'stop' };
    if (text === 'help') return { kind: 'help' };
    if (/^(o-o-o|0-0-0|castle queen\s?side|castle long|long castle)$/.test(text)) return { kind: 'castle', side: 'queen' };
    if (/^(o-o|0-0|castle|castle king\s?side|castle short|short castle)$/.test(text)) return { kind: 'castle', side: 'king' };
    text = text.replace(/^(?:please\s+)?(?:move\s+)?/, '');

    // Compact coordinates and SAN are also useful when recognition returns notation.
    const coordinate = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text);
    if (coordinate) return { kind: 'move', from: coordinate[1], to: coordinate[2], ...(coordinate[3] ? { promotion: coordinate[3] } : {}) };
    const pawnSan = /^(?:([a-h])x)?([a-h][1-8])(?:=([qrbn]))?$/.exec(text);
    if (pawnSan) return { kind: 'move', piece: 'p', to: pawnSan[2], ...(pawnSan[1] ? { origin: pawnSan[1] } : {}), ...(pawnSan[3] ? { promotion: pawnSan[3] } : {}) };
    const san = /^([nbrqk])([a-h1-8]?)(x?)([a-h][1-8])(?:=([qrbn]))?$/.exec(text);
    if (san) return { kind: 'move', piece: san[1], to: san[4], ...(san[2] ? { origin: san[2] } : {}), ...(san[5] ? { promotion: san[5] } : {}) };

    let promotion;
    const promoted = /\s+(?:promote(?:\s+to)?|promotion(?:\s+to)?|equals|=)\s+(\w+)$/.exec(text);
    if (promoted) {
      promotion = promotionPieces[promoted[1]];
      if (!promotion) return null;
      text = text.slice(0, promoted.index);
    }
    const tokens = text.replace(/([a-h])([1-8])/g, '$1 $2').replace(/-/g, ' ').split(/\s+/);
    const piece = pieces[tokens[0]];
    let index = piece ? 1 : 0;
    let origin;
    if (tokens[index] === 'from') index++;
    const fileHint = piece && files[tokens[index]] && tokens[index + 1] === 'to' && square(tokens, index + 2)?.end === tokens.length;
    const first = fileHint ? null : square(tokens, index);
    if (!first && !connectors.has(tokens[index]) && (files[tokens[index]] || ranks[tokens[index]] || /^[1-8]$/.test(tokens[index] ?? ''))) {
      origin = files[tokens[index]] ?? ranks[tokens[index]] ?? tokens[index];
      index++;
    }
    if (connectors.has(tokens[index])) index++;
    const destination = square(tokens, first ? first.end + (connectors.has(tokens[first.end]) ? 1 : 0) : index);
    const extra = promotion ? { promotion } : {};
    if (first && destination && destination.end === tokens.length) {
      return { kind: 'move', from: first.value, to: destination.value, ...(piece ? { piece } : {}), ...extra };
    }
    if (first && first.end === tokens.length) return { kind: 'move', piece: piece ?? 'p', to: first.value, ...extra };
    if (!first && destination && destination.end === tokens.length) {
      return { kind: 'move', piece: piece ?? 'p', to: destination.value, ...(origin ? { origin } : {}), ...extra };
    }
    return null;
  }

  function resolve(command, legalMoves) {
    let candidates;
    if (command.kind === 'castle') {
      candidates = legalMoves.filter(move => move.piece === 'k' && move.from[0] === 'e' && move.to === (command.side === 'king' ? 'g' : 'c') + move.from[1]);
    } else {
      candidates = legalMoves.filter(move => move.to === command.to &&
        (!command.from || move.from === command.from) &&
        (!command.piece || move.piece === command.piece) &&
        (!command.origin || move.from.includes(command.origin)) &&
        (move.promotion ? move.promotion === (command.promotion ?? 'q') : !command.promotion));
    }
    // Some board versions repeat the same move in the legal-move collection.
    candidates = candidates.filter((move, index, all) => all.findIndex(other => other.from === move.from && other.to === move.to && other.promotion === move.promotion) === index);
    if (!candidates.length) return { error: 'No legal move matches. Try the source and destination.' };
    if (candidates.length > 1) return { error: `Which piece? Say ${candidates.map(move => move.from).join(' or ')} + ${candidates[0].to}.` };
    return { move: candidates[0] };
  }

  return Object.freeze({ parse, resolve });
})();
