package com.voicechess.core

import org.junit.Assert.*
import org.junit.Test

class PuzzleSessionTest {
    private val catalog = BundledPuzzleRepository().puzzles()
    private val session = PuzzleSession(catalog)
    private val parser = VoiceCommandParser()

    @Test fun `correct spoken move updates the board and solves the puzzle`() {
        val result = session.handle(session.start(), parser.parse("rook to e eight"))
        assertTrue(result.solved)
        assertNull(result.board.pieces[Square("e1")])
        assertEquals(Piece(PieceType.ROOK, Side.WHITE), result.board.pieces[Square("e8")])
        assertEquals(1, result.history.size)
        assertTrue(result.message.contains("Puzzle solved"))
    }

    @Test fun `wrong moves never change the puzzle position or progress`() {
        val start = session.start()
        val result = session.handle(start, parser.parse("rook to e seven"))
        assertEquals(start.board, result.board)
        assertEquals(0, result.ply)
        assertFalse(result.solved)
    }

    @Test fun `multi move puzzle plays the opponent reply before listening again`() {
        val result = session.handle(session.start(2), parser.parse("queen to g eight"))
        assertEquals(2, result.ply)
        assertFalse(result.solved)
        assertEquals(Side.WHITE, result.board.turn)
        assertEquals(Piece(PieceType.ROOK, Side.BLACK), result.board.pieces[Square("g8")])
        assertNull(result.board.pieces[Square("e6")])
        assertNull(result.board.pieces[Square("f8")])
        assertEquals(2, result.history.size)
        assertTrue(result.message.contains("Their reply"))
        assertTrue(session.handle(result, parser.parse("knight to f seven")).solved)
    }

    @Test fun `ambiguous piece destination requests the source instead of using the answer`() {
        val ambiguous = catalog[0].copy(fen = "6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1",
            solution = listOf(Move.fromUci("a1d1")))
        val engine = PuzzleSession(listOf(ambiguous))
        val start = engine.start()
        val result = engine.handle(start, parser.parse("rook to d one"))
        assertEquals(start.board, result.board)
        assertTrue(result.message.contains("source square"))
        assertTrue(engine.handle(start, parser.parse("a one to d one")).solved)
    }

    @Test fun `hint and read board preserve the solution state`() {
        val start = session.start()
        val hint = session.handle(start, VoiceCommand.Hint)
        assertEquals(start.board, hint.board)
        assertEquals(start.puzzle.hint, hint.message)
        val board = session.handle(start, VoiceCommand.ReadBoard)
        assertTrue(board.message.contains("rook on e 1"))
        assertTrue(board.message.contains("White to move"))
        assertEquals(0, board.ply)
    }

    @Test fun `reset restores a solved puzzle and next wraps the local catalog`() {
        val solved = session.handle(session.start(), parser.parse("e1e8"))
        val reset = session.handle(solved, VoiceCommand.Reset)
        assertFalse(reset.solved)
        assertEquals(catalog[0].initialBoard, reset.board)
        assertTrue(reset.history.isEmpty())
        assertEquals(0, session.handle(session.start(2), VoiceCommand.Next).puzzleIndex)
    }

    @Test fun `completed puzzles do not accept further moves`() {
        val solved = session.handle(session.start(), parser.parse("e1e8"))
        val result = session.handle(solved, parser.parse("e8e7"))
        assertEquals(solved.board, result.board)
        assertEquals(solved.history, result.history)
    }

    @Test fun `all bundled solution lines play to completion`() {
        catalog.indices.forEach { index ->
            var state = session.start(index)
            while (!state.solved) {
                val move = state.puzzle.solution[state.ply]
                state = session.handle(state, VoiceCommand.Play(move.from, move.to, null, move.promotion))
            }
            assertEquals(catalog[index].solution.size, state.history.size)
        }
    }

    @Test fun `a supplied piece name must match the source piece`() {
        val start = session.start()
        assertEquals(start.board, session.handle(start, parser.parse("queen e1 to e8")).board)
    }

    @Test fun `black to move puzzles use the same voice pipeline`() {
        val black = catalog[0].copy(fen = "4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1",
            solution = listOf(Move.fromUci("e8e1")))
        val engine = PuzzleSession(listOf(black))
        val result = engine.handle(engine.start(), parser.parse("rook to e one"))
        assertTrue(result.solved)
        assertEquals(Piece(PieceType.ROOK, Side.BLACK), result.board.pieces[Square("e1")])
    }
}
