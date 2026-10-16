/* Keep Chess.com's undocumented board API behind this small adapter. */
const VoiceChessBoard = (() => {
  const squarePattern = /^[a-h][1-8]$/;

  function piecesFromFen(fen) {
    const pieces = new Map();
    const rows = fen.split(' ')[0].split('/');
    if (rows.length !== 8) throw new Error('The puzzle position is unavailable.');
    rows.forEach((row, rank) => {
      let file = 0;
      for (const char of row) {
        if (/[1-8]/.test(char)) file += Number(char);
        else if (/[prnbqk]/i.test(char) && file < 8) {
          pieces.set(String.fromCharCode(97 + file++) + (8 - rank), { type: char.toLowerCase(), color: char === char.toUpperCase() ? 'w' : 'b' });
        } else throw new Error('The puzzle position is unavailable.');
      }
      if (file !== 8) throw new Error('The puzzle position is unavailable.');
    });
    return pieces;
  }

  function color(value) {
    if (value === 1 || value === 'w' || value === 'white') return 'w';
    if (value === 2 || value === 'b' || value === 'black') return 'b';
    return null;
  }

  function findElement(doc = document) {
    return Array.from(doc.querySelectorAll('wc-chess-board, chess-board')).find(board => {
      const bounds = board.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && board.game;
    });
  }

  function observe(doc = document) {
    const element = findElement(doc);
    const game = element?.game;
    if (!game || typeof game.getFEN !== 'function' || typeof game.getLegalMoves !== 'function' || typeof game.move !== 'function') {
      throw new Error('Start a Puzzle Rush to connect the board.');
    }
    if (game.getMode?.()?.name === 'passive-observing') throw new Error('Start a Puzzle Rush to connect the board.');
    const options = game.getOptions?.();
    const fen = game.getFEN();
    if (typeof fen !== 'string' || !/^[^ ]+ [wb] /.test(fen)) throw new Error('The puzzle position is unavailable.');
    const turn = fen.split(' ')[1];
    const player = color(game.getPlayingAs?.()) ?? (typeof options?.flipped === 'boolean' ? (options.flipped ? 'b' : 'w') : null);
    if (!player) throw new Error('Could not determine the puzzle side.');
    const pieces = piecesFromFen(fen);
    const rawMoves = game.getLegalMoves();
    if (!Array.isArray(rawMoves) || rawMoves.some(move => !move || typeof move.from !== 'string' || typeof move.to !== 'string' || !squarePattern.test(move.from) || !squarePattern.test(move.to))) {
      throw new Error('This board version is not supported.');
    }
    const moves = rawMoves.filter(move => pieces.get(move.from)?.color === turn)
      .map(move => ({ from: move.from, to: move.to, piece: pieces.get(move.from).type, san: move.san, ...(move.promotion ? { promotion: String(move.promotion).toLowerCase() } : {}), raw: move }));
    if (moves.some(move => typeof move.san !== 'string' || !move.san)) throw new Error('This board version does not provide standard move notation.');
    if (moves.some(move => move.promotion !== /=([QRBN])[+#]?$/.exec(move.san)?.[1].toLowerCase())) {
      throw new Error('This board version does not provide consistent promotion choices.');
    }
    return { element, game, fen, moves, player, turn,
      waiting: options?.enabled === false ? 'disabled' : game.isAnimating?.() ? 'animation' : player !== turn ? 'opponent' : null };
  }

  function snapshot(doc = document) {
    const position = observe(doc);
    if (position.waiting === 'opponent') throw new Error('Wait for your turn.');
    if (position.waiting) throw new Error('Wait for the board to be ready.');
    if (!position.moves.length) throw new Error('No moves available. Start the next puzzle.');
    return position;
  }

  // Verify an observed transition using supplied native moves. This never
  // generates moves or decides legality from piece movement geometry.
  function follows(before, after, expected) {
    if (before.element !== after.element || before.game !== after.game || before.player !== after.player || before.turn === after.turn) return false;
    const first = before.fen.split(' '), second = after.fen.split(' ');
    if (!/^[1-9]\d*$/.test(first[5]) || Number(second[5]) !== Number(first[5]) + (before.turn === 'b' ? 1 : 0)) return false;
    const target = piecesFromFen(after.fen);
    return before.moves.some(move => {
      if (expected && (move.from !== expected.from || move.to !== expected.to || move.promotion !== expected.promotion || move.san !== expected.san)) return false;
      const pieces = piecesFromFen(before.fen);
      const piece = pieces.get(move.from);
      if (!piece) return false;
      if (piece.type === 'p' && move.san.includes('x') && !pieces.has(move.to)) pieces.delete(move.to[0] + move.from[1]);
      pieces.delete(move.from);
      pieces.set(move.to, { type: move.promotion ?? piece.type, color: piece.color });
      if (/^O-O/.test(move.san)) {
        const rank = move.from[1], long = move.san.startsWith('O-O-O');
        const rook = pieces.get((long ? 'a' : 'h') + rank);
        if (rook?.type !== 'r' || rook.color !== piece.color) return false;
        pieces.delete((long ? 'a' : 'h') + rank);
        pieces.set((long ? 'd' : 'f') + rank, rook);
      }
      return pieces.size === target.size && [...pieces].every(([square, value]) => target.get(square)?.type === value.type && target.get(square)?.color === value.color);
    });
  }

  function play(position, move, doc = document) {
    const current = snapshot(doc);
    if (current.element !== position.element || current.game !== position.game || current.fen !== position.fen) throw new Error('The puzzle changed. Say your move again.');
    const available = position.moves.includes(move) && current.moves.find(candidate => candidate.from === move.from && candidate.to === move.to && candidate.promotion === move.promotion && candidate.san === move.san);
    if (!available) throw new Error('That move is no longer available. Say your move again.');
    if (current.element.game !== position.game || current.game.getFEN() !== position.fen) throw new Error('The puzzle changed. Say your move again.');
    // userGenerated sends the move through the puzzle's ordinary input handling.
    try {
      current.game.move({ from: available.from, to: available.to, ...(available.promotion ? { promotion: available.raw.promotion } : {}), animate: true, userGenerated: true });
    } catch {
      // An exception here may happen after dispatch. Report the attempt separately
      // from validation failures, so the caller never retries accepted input.
      return { uncertain: true };
    }
  }

  return Object.freeze({ snapshot, observe, follows, play, piecesFromFen, findElement });
})();
