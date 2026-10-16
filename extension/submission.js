// Track one dispatched move without retaining requests for future positions.
const VoiceChessSubmission = class {
  constructor({ read, play, onStatus, now = Date.now }) {
    Object.assign(this, { read, play, onStatus, now });
  }

  reset() {
    this.pending = null;
    this.lastSubmission = null;
  }

  send(position, move) {
    this.tick();
    if (this.pending) throw new Error('Wait for the board to confirm the move.');
    const last = this.lastSubmission;
    if (last && last.position.element === position.element && last.position.game === position.game && last.position.fen === position.fen &&
      last.move.from === move.from && last.move.to === move.to && last.move.promotion === move.promotion) {
      throw new Error('Already sent. Wait for the board to change.');
    }
    const pending = this.pending = { position, move, at: this.now() };
    // The adapter throws before dispatch and reports exceptions after dispatch
    // as uncertain. An uncertain attempt must never be retried automatically.
    let result;
    try { result = this.play(position, move); } catch (error) { this.pending = null; throw error; }
    this.lastSubmission = pending;
    if (this.pending !== pending) return; // Stopped during synchronous dispatch.
    pending.uncertain = Boolean(result?.uncertain);
    this.onStatus(pending.uncertain ? 'Could not confirm the move. Checking board…' : `Sent ${move.san}`);
  }

  tick() {
    if (!this.pending) return;
    const pending = this.pending;
    try {
      const position = this.read();
      if (pending.position.element !== position.element || pending.position.game !== position.game || pending.position.fen !== position.fen) {
        this.pending = null;
        this.onStatus(`Sent ${pending.move.san}`);
      } else if (this.now() - pending.at >= 600) {
        this.pending = null;
        this.onStatus(pending.uncertain ? 'Board rejected the move. Use the mouse, then retry.' : 'Board did not change. Check the puzzle is running.');
      }
    } catch (error) {
      this.pending = null;
      this.onStatus(error.message || 'Could not read this board.');
    }
  }
};
