package com.voicechess.core

import java.util.Locale

sealed interface VoiceCommand {
    data class Play(val from: Square?, val to: Square, val piece: PieceType?, val promotion: PieceType?) : VoiceCommand
    data object Hint : VoiceCommand
    data object Repeat : VoiceCommand
    data object ReadBoard : VoiceCommand
    data object Reset : VoiceCommand
    data object Next : VoiceCommand
    data object Help : VoiceCommand
    data object Stop : VoiceCommand
}

class VoiceCommandParser {
    private val files = mapOf(
        "a" to 'a', "ay" to 'a', "alpha" to 'a',
        "b" to 'b', "bee" to 'b', "be" to 'b', "bravo" to 'b',
        "c" to 'c', "see" to 'c', "sea" to 'c', "charlie" to 'c',
        "d" to 'd', "dee" to 'd', "delta" to 'd',
        "e" to 'e', "ee" to 'e', "echo" to 'e',
        "f" to 'f', "eff" to 'f', "foxtrot" to 'f',
        "g" to 'g', "gee" to 'g', "golf" to 'g',
        "h" to 'h', "aitch" to 'h', "hotel" to 'h',
    )
    private val ranks = mapOf(
        "one" to '1', "won" to '1', "two" to '2', "too" to '2', "to" to '2',
        "three" to '3', "four" to '4', "for" to '4', "five" to '5',
        "six" to '6', "seven" to '7', "eight" to '8', "ate" to '8',
    ) + ('1'..'8').associate { it.toString() to it }

    fun parse(transcript: String): VoiceCommand? {
        val normalized = transcript.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9 ]"), " ")
            .trim().replace(Regex("\\s+"), " ")
        when (normalized.removePrefix("please ")) {
            "hint", "give me a hint" -> return VoiceCommand.Hint
            "repeat", "repeat puzzle", "repeat that" -> return VoiceCommand.Repeat
            "read board", "read the board", "describe board", "describe the board" -> return VoiceCommand.ReadBoard
            "reset", "restart", "reset puzzle", "try again" -> return VoiceCommand.Reset
            "next", "next puzzle", "skip" -> return VoiceCommand.Next
            "help", "commands", "what can i say" -> return VoiceCommand.Help
            "stop", "stop listening", "pause" -> return VoiceCommand.Stop
        }
        if (normalized.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?"))) {
            val move = Move.fromUci(normalized)
            return VoiceCommand.Play(move.from, move.to, null, move.promotion)
        }
        val tokens = normalized.split(" ")
        if (tokens.any { it.matches(Regex("[a-h][0-9]+")) && !it.matches(Regex("[a-h][1-8]")) }) return null
        if (tokens.zipWithNext().any { (file, rank) -> files[file] != null && rank in listOf("zero", "nine", "ten", "0", "9", "10") }) return null
        val promotionIndex = tokens.indexOfFirst { it in listOf("promote", "promotion") }
        val moveTokens = if (promotionIndex < 0) tokens else tokens.take(promotionIndex)
        fun typeFor(word: String) = when (word) {
            "night" -> PieceType.KNIGHT
            else -> PieceType.entries.firstOrNull { it.spoken == word }
        }
        val promotion = if (promotionIndex < 0) null else {
            tokens.drop(promotionIndex + 1).mapNotNull(::typeFor).singleOrNull()
                ?.takeIf { it in listOf(PieceType.QUEEN, PieceType.ROOK, PieceType.BISHOP, PieceType.KNIGHT) }
                ?: return null
        }
        val types = moveTokens.mapNotNull(::typeFor)
        if (types.size > 1) return null
        val squares = mutableListOf<Square>()
        var index = 0
        while (index < moveTokens.size) {
            val word = moveTokens[index]
            when {
                word.matches(Regex("[a-h][1-8][a-h][1-8]")) -> {
                    squares += Square(word.take(2))
                    squares += Square(word.takeLast(2))
                }
                word.matches(Regex("[a-h][1-8]")) -> squares += Square(word)
                files[word] != null && ranks[moveTokens.getOrNull(index + 1)] != null -> {
                    squares += Square("${files[word]}${ranks[moveTokens[++index]]}")
                }
            }
            index++
        }
        return when {
            squares.size == 2 && squares[0] != squares[1] -> VoiceCommand.Play(squares[0], squares[1], types.singleOrNull(), promotion)
            squares.size == 1 && types.size == 1 -> VoiceCommand.Play(null, squares[0], types.single(), promotion)
            else -> null
        }
    }
}
