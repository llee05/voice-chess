// Requests only: each move resolves anew against the board when its turn arrives.
const VoiceChessQueue = class {
  constructor({ read, resolve, play, follows, onStatus, onQueue, now = Date.now }) {
    Object.assign(this, { read, resolve, play, follows, onStatus, onQueue, now });
    this.moves = [];
  }

  clear(message) {
    this.moves = [];
    this.anchor = null;
    this.onQueue([]);
    if (message) this.onStatus(message);
  }

  reset() {
    this.clear();
    this.pending = null;
    this.lastSubmission = null;
  }

  append(moves) {
    if (moves.length + this.moves.length > 6) { this.onStatus('Queue full. Keep at most six moves.'); return; }
    try {
      const position = this.read();
      if (position.waiting === 'disabled') throw new Error('The board is disabled.');
      if (!this.moves.length) this.anchor = position;
      this.moves.push(...moves);
      this.expires = this.now() + 15000;
      this.onQueue(this.moves);
      this.tick(position);
    } catch (error) { this.clear(`Queue cleared. ${error.message}`); }
  }

  send(position, move) {
    if (this.pending?.position.fen === position.fen && this.pending.position.game === position.game && this.pending.position.element === position.element) return;
    const key = `${position.fen}:${move.from}${move.to}${move.promotion ?? ''}`;
    if (this.lastSubmission === key) throw new Error('Already sent. Wait for the board to change.');
    const pending = this.pending = { position, move, at: this.now() };
    // Validation errors throw before dispatch; exceptions after dispatch are
    // reported as uncertain by the adapter and must never cause a retry.
    let result;
    try { result = this.play(position, move); } catch (error) { this.pending = null; throw error; }
    this.lastSubmission = key;
    if (this.pending !== pending) return; // Stopped during synchronous dispatch.
    if (result?.uncertain) this.clear('Could not confirm the move. Queue cleared; checking board…');
    else this.onStatus(`Sent ${move.san}`);
    pending.uncertain = Boolean(result?.uncertain);
  }

  tick(position) {
    if (!this.moves.length && !this.pending) return;
    try {
      position ??= this.read();
      if (this.moves.length) {
        if (this.now() >= this.expires) { this.clear('Queue expired. Say the moves again.'); return; }
        if (position.waiting === 'disabled') throw new Error('The board is disabled.');
        if (!position.moves.length && position.waiting !== 'animation') throw new Error('No legal moves are available.');
        const before = this.anchor;
        if (before.element !== position.element || before.game !== position.game || before.player !== position.player) throw new Error('The puzzle changed.');
        if (before.fen !== position.fen) {
          const expected = this.pending?.position.fen === before.fen ? this.pending.move : null;
          if ((!expected && before.turn === before.player) || !this.follows(before, position, expected)) throw new Error('The position changed unexpectedly.');
          this.expires = this.now() + 15000;
        }
        this.anchor = position;
      }
      if (this.pending) {
        const pending = this.pending;
        if (pending.position.element !== position.element || pending.position.game !== position.game || pending.position.fen !== position.fen) {
          this.pending = null;
          this.onStatus(`Sent ${pending.move.san}`);
        } else if (this.now() - pending.at >= 600) {
          this.pending = null;
          this.clear(pending.uncertain ? 'Board rejected the move. Queue cleared. Use the mouse, then retry.' : 'Board did not change. Queue cleared. Check the puzzle is running.');
          return;
        } else return;
      }
      if (!this.moves.length || position.waiting) return;
      const result = this.resolve(this.moves[0], position.moves);
      if (result.error) throw new Error(result.error);
      const move = this.moves.shift();
      this.onQueue(this.moves);
      try { this.send(position, result.move); } catch (error) { this.moves.unshift(move); throw error; }
    } catch (error) {
      this.pending = null;
      this.clear(`Queue cleared. ${error.message || 'Could not read this board.'}`);
    }
  }
};
