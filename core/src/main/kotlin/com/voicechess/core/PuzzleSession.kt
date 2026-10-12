package com.voicechess.core

data class SessionState(
    val puzzleIndex: Int,
    val puzzle: Puzzle,
    val board: Board = puzzle.initialBoard,
    val ply: Int = 0,
    val lastMove: Move? = null,
    val history: List<String> = emptyList(),
    val message: String = "${puzzle.initialBoard.turn.label} to move. ${puzzle.goal}.",
) {
    val solved get() = ply == puzzle.solution.size
    val introduction get() = "${puzzle.title}. ${board.turn.label} to move. ${puzzle.goal}. Say your move, or say read board."
}

class PuzzleSession(private val puzzles: List<Puzzle>) {
    init {
        require(puzzles.isNotEmpty())
        require(puzzles.all { it.solution.isNotEmpty() && it.solution.size % 2 == 1 })
    }
    val count get() = puzzles.size
    fun start(index: Int = 0) = SessionState(index.mod(puzzles.size), puzzles[index.mod(puzzles.size)])

    fun handle(state: SessionState, command: VoiceCommand?): SessionState = when (command) {
        null -> state.copy(message = "I couldn't understand that move. Say a source and destination, like e one to e eight, or say help.")
        VoiceCommand.Hint -> state.copy(message = state.puzzle.hint)
        VoiceCommand.Repeat -> state.copy(message = if (state.solved) "Puzzle solved. Say next puzzle." else state.introduction)
        VoiceCommand.ReadBoard -> state.copy(message = state.board.describe())
        VoiceCommand.Reset -> start(state.puzzleIndex).let { it.copy(message = "Puzzle reset. ${it.introduction}") }
        VoiceCommand.Next -> start(state.puzzleIndex + 1).let { it.copy(message = it.introduction) }
        VoiceCommand.Help -> state.copy(message = HELP)
        VoiceCommand.Stop -> state.copy(message = "Voice session paused.")
        is VoiceCommand.Play -> play(state, command)
    }

    private fun play(state: SessionState, command: VoiceCommand.Play): SessionState {
        if (state.solved) return state.copy(message = "Already solved. Say next puzzle, or reset to try again.")
        val candidates = state.board.pieces.filter { (square, piece) ->
            piece.side == state.board.turn && (command.from == null || square == command.from) &&
                (command.piece == null || piece.type == command.piece) && state.board.canReach(square, command.to)
        }.keys.toList()
        if (candidates.size > 1) return state.copy(message = "More than one piece can reach ${command.to.spoken}. Please say the source square too.")
        if (candidates.isEmpty()) return state.copy(message = "That move doesn't fit this position. Try again, or say hint.")
        val move = Move(candidates.single(), command.to, command.promotion)
        if (move != state.puzzle.solution[state.ply]) return state.copy(message = "That's not the puzzle move. Try again, or say hint.")
        val playerMove = describeMove(state.board, move)
        var board = state.board.play(move)
        var ply = state.ply + 1
        var lastMove = move
        val history = state.history.toMutableList().apply { add(playerMove) }
        var reply = ""
        if (ply < state.puzzle.solution.size) {
            val response = state.puzzle.solution[ply]
            reply = describeMove(board, response)
            history += reply
            board = board.play(response)
            lastMove = response
            ply++
        }
        val message = if (ply == state.puzzle.solution.size) {
            "Correct. $playerMove. Puzzle solved! ${state.puzzle.explanation} Say next puzzle to continue."
        } else "Correct. $playerMove. Their reply: $reply. Your move."
        return state.copy(board = board, ply = ply, lastMove = lastMove, history = history, message = message)
    }

    private fun describeMove(board: Board, move: Move): String {
        val piece = board.pieces.getValue(move.from)
        val action = if (move.to in board.pieces) "takes" else "to"
        return "${piece.side.label} ${piece.type.spoken} $action ${move.to.spoken}" +
            (move.promotion?.let { ", promoting to ${it.spoken}" } ?: "")
    }

    companion object {
        const val HELP = "Say a move like e one to e eight, or rook to e eight. You can also say hint, read board, repeat, reset, next puzzle, or stop. Use alpha through hotel for the files if needed."
    }
}
