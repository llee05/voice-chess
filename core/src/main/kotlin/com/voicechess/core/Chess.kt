package com.voicechess.core

import kotlin.math.abs

enum class Side(val label: String) {
    WHITE("White"), BLACK("Black");
    fun opposite() = if (this == WHITE) BLACK else WHITE
}

enum class PieceType(val symbol: Char, val spoken: String, val glyph: String) {
    KING('k', "king", "♚"), QUEEN('q', "queen", "♛"), ROOK('r', "rook", "♜"),
    BISHOP('b', "bishop", "♝"), KNIGHT('n', "knight", "♞"), PAWN('p', "pawn", "♟");
}

data class Square(val value: String) {
    init { require(value.matches(Regex("[a-h][1-8]"))) { "Invalid square: $value" } }
    val file get() = value[0] - 'a'
    val rank get() = value[1].digitToInt() - 1
    val spoken get() = "${value[0]} ${value[1]}"
    companion object {
        fun at(file: Int, rank: Int) = Square("${'a' + file}${rank + 1}")
    }
}

data class Piece(val type: PieceType, val side: Side) {
    val description get() = "${side.label} ${type.spoken}"
}

data class Move(val from: Square, val to: Square, val promotion: PieceType? = null) {
    companion object {
        fun fromUci(uci: String): Move {
            require(uci.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?")))
            return Move(Square(uci.take(2)), Square(uci.substring(2, 4)),
                uci.getOrNull(4)?.let { symbol -> PieceType.entries.first { it.symbol == symbol } })
        }
    }
}

/** A board for curated solution playback, not a full chess rules engine. */
data class Board(val pieces: Map<Square, Piece>, val turn: Side) {
    fun play(move: Move): Board {
        val piece = requireNotNull(pieces[move.from]) { "No piece on ${move.from.value}" }
        require(piece.side == turn)
        require(canReach(move.from, move.to))
        require(move.promotion == null ||
            (piece.type == PieceType.PAWN && move.to.rank in listOf(0, 7)))
        return Board(pieces - move.from + (move.to to piece.copy(type = move.promotion ?: piece.type)), turn.opposite())
    }

    /** Geometry is sufficient to disambiguate speech in the bundled positions.
     * King safety, castling and en passant require a rules engine before adding arbitrary puzzles. */
    fun canReach(from: Square, to: Square): Boolean {
        val piece = pieces[from] ?: return false
        if (from == to || pieces[to]?.side == piece.side) return false
        val dx = to.file - from.file
        val dy = to.rank - from.rank
        fun clearPath(): Boolean {
            val steps = maxOf(abs(dx), abs(dy))
            return (1 until steps).all { step ->
                Square.at(from.file + dx.compareTo(0) * step, from.rank + dy.compareTo(0) * step) !in pieces
            }
        }
        return when (piece.type) {
            PieceType.KING -> maxOf(abs(dx), abs(dy)) == 1
            PieceType.KNIGHT -> abs(dx) * abs(dy) == 2
            PieceType.BISHOP -> abs(dx) == abs(dy) && clearPath()
            PieceType.ROOK -> (dx == 0 || dy == 0) && clearPath()
            PieceType.QUEEN -> (dx == 0 || dy == 0 || abs(dx) == abs(dy)) && clearPath()
            PieceType.PAWN -> {
                val direction = if (piece.side == Side.WHITE) 1 else -1
                val homeRank = if (piece.side == Side.WHITE) 1 else 6
                when {
                    abs(dx) == 1 && dy == direction -> pieces[to] != null
                    dx != 0 || pieces[to] != null -> false
                    dy == direction -> true
                    dy == 2 * direction && from.rank == homeRank -> clearPath()
                    else -> false
                }
            }
        }
    }

    fun describe(): String = Side.entries.joinToString(". ") { side ->
        val list = pieces.entries.filter { it.value.side == side }
            .sortedBy { it.key.value }
            .joinToString(", ") { "${it.value.type.spoken} on ${it.key.spoken}" }
        "${side.label}: $list"
    } + ". ${turn.label} to move."

    companion object {
        fun fromFen(fen: String): Board {
            val fields = fen.split(" ")
            require(fields.size >= 2 && fields[1] in listOf("w", "b"))
            val rows = fields[0].split("/")
            require(rows.size == 8)
            val pieces = mutableMapOf<Square, Piece>()
            rows.forEachIndexed { row, text ->
                var file = 0
                text.forEach { char ->
                    if (char in '1'..'8') file += char.digitToInt()
                    else {
                        require(file < 8)
                        val type = requireNotNull(PieceType.entries.firstOrNull { it.symbol == char.lowercaseChar() }) {
                            "Invalid FEN piece: $char"
                        }
                        pieces[Square.at(file++, 7 - row)] = Piece(type, if (char.isUpperCase()) Side.WHITE else Side.BLACK)
                    }
                }
                require(file == 8)
            }
            return Board(pieces.toMap(), if (fields[1] == "w") Side.WHITE else Side.BLACK)
        }
    }
}
