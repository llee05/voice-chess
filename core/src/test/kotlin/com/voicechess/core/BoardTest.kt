package com.voicechess.core

import org.junit.Assert.*
import org.junit.Test

class BoardTest {
    @Test fun `blocking pieces prevent sliding moves`() {
        val board = Board.fromFen("6k1/8/8/8/8/8/4P3/4R1K1 w - - 0 1")
        assertFalse(board.canReach(Square("e1"), Square("e8")))
        assertFalse(board.canReach(Square("e1"), Square("e2")))
        assertTrue(board.canReach(Square("e1"), Square("a1")))
    }

    @Test fun `pawn advance and capture use different geometry`() {
        val board = Board.fromFen("6k1/8/8/8/8/3p4/4P3/6K1 w - - 0 1")
        assertTrue(board.canReach(Square("e2"), Square("e4")))
        assertTrue(board.canReach(Square("e2"), Square("d3")))
        assertFalse(board.canReach(Square("e2"), Square("f3")))
        assertFalse(board.canReach(Square("e2"), Square("e1")))
    }

    @Test fun `known promotion changes the piece on the board`() {
        val board = Board.fromFen("6k1/4P3/8/8/8/8/8/6K1 w - - 0 1")
        val result = board.play(Move.fromUci("e7e8q"))
        assertEquals(Piece(PieceType.QUEEN, Side.WHITE), result.pieces[Square("e8")])
    }

    @Test(expected = IllegalArgumentException::class)
    fun `invalid FEN row width is rejected`() { Board.fromFen("9/8/8/8/8/8/8/8 w - - 0 1") }

    @Test(expected = IllegalArgumentException::class)
    fun `invalid squares are rejected`() { Square("e9") }
}
