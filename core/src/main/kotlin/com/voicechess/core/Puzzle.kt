package com.voicechess.core

data class Puzzle(
    val id: String,
    val title: String,
    val theme: String,
    val goal: String,
    val fen: String,
    val solution: List<Move>,
    val hint: String,
    val explanation: String,
) {
    val initialBoard get() = Board.fromFen(fen)
}

interface PuzzleRepository {
    fun puzzles(): List<Puzzle>
}

class BundledPuzzleRepository : PuzzleRepository {
    override fun puzzles() = listOf(
        Puzzle(
            id = "back-rank", title = "The last rank", theme = "Back-rank mate", goal = "Mate in one",
            fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
            solution = listOf(Move.fromUci("e1e8")),
            hint = "Their king is trapped behind its own pawns. Find a rook check on the last rank.",
            explanation = "The rook controls the eighth rank, and the king's own pawns block every escape.",
        ),
        Puzzle(
            id = "protected-queen", title = "A little support", theme = "King & queen", goal = "Mate in one",
            fen = "6k1/8/5K1Q/8/8/8/8/8 w - - 0 1",
            solution = listOf(Move.fromUci("h6g7")),
            hint = "Bring the queen next to their king, onto a square protected by your king.",
            explanation = "Your king protects the queen on g seven. The queen covers every escape square.",
        ),
        Puzzle(
            id = "smothered-mate", title = "Room to breathe", theme = "Smothered mate", goal = "Mate in two",
            fen = "5r1k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1",
            solution = listOf("e6g8", "f8g8", "h6f7").map(Move::fromUci),
            hint = "Sacrifice your queen with check. Their rook will block the king's last escape.",
            explanation = "The queen sacrifice forces rook takes g eight. Knight to f seven delivers smothered mate.",
        ),
    )
}
