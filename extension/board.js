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

  function snapshot(doc = document) {
    const element = Array.from(doc.querySelectorAll('wc-chess-board, chess-board')).find(board => {
      const bounds = board.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && board.game;
    });
    const game = element?.game;
    if (!game || typeof game.getFEN !== 'function' || typeof game.getLegalMoves !== 'function' || typeof game.move !== 'function') {
      throw new Error('Start a Puzzle Rush to connect the board.');
    }
    if (game.getMode?.()?.name === 'passive-observing') throw new Error('Start a Puzzle Rush to connect the board.');
    const options = game.getOptions?.();
    if (game.isAnimating?.() || options?.enabled === false) throw new Error('Wait for the board to be ready.');
    const fen = game.getFEN();
    if (typeof fen !== 'string' || !/^[^ ]+ [wb] /.test(fen)) throw new Error('The puzzle position is unavailable.');
    const turn = fen.split(' ')[1];
    const player = color(game.getPlayingAs?.()) ?? (typeof options?.flipped === 'boolean' ? (options.flipped ? 'b' : 'w') : null);
    if (!player) throw new Error('Could not determine the puzzle side.');
    if (player !== turn) throw new Error('Wait for your turn.');
    const pieces = piecesFromFen(fen);
    const rawMoves = game.getLegalMoves();
    if (!Array.isArray(rawMoves)) throw new Error('This board version is not supported.');
    const moves = rawMoves.filter(move => squarePattern.test(move.from) && squarePattern.test(move.to) && pieces.get(move.from)?.color === turn)
      .map(move => ({ from: move.from, to: move.to, piece: pieces.get(move.from).type, ...(move.promotion ? { promotion: String(move.promotion).toLowerCase() } : {}), raw: move }));
    if (!moves.length) throw new Error('No moves available. Start the next puzzle.');
    return { element, game, fen, moves };
  }

  function play(position, move, doc = document) {
    const current = snapshot(doc);
    if (current.game !== position.game || current.fen !== position.fen) throw new Error('The puzzle changed. Say your move again.');
    // userGenerated sends the move through the puzzle's ordinary input handling.
    current.game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.raw?.promotion ?? move.promotion } : {}), animate: true, userGenerated: true });
  }

  return Object.freeze({ snapshot, play, piecesFromFen });
})();
