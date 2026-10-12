package com.voicechess.core

import org.junit.Assert.*
import org.junit.Test

class VoiceCommandParserTest {
    private val parser = VoiceCommandParser()

    @Test fun `coordinates work across common speech transcriptions`() {
        listOf("e one to e eight", "E1 to E8!", "echo one to echo eight", "please move from e1 to e8", "e1e8").forEach {
            assertEquals(it, VoiceCommand.Play(Square("e1"), Square("e8"), null, null), parser.parse(it))
        }
    }

    @Test fun `piece destinations and knight homophones are recognized`() {
        assertEquals(VoiceCommand.Play(null, Square("f7"), PieceType.KNIGHT, null), parser.parse("night to eff seven"))
        assertEquals(VoiceCommand.Play(null, Square("g7"), PieceType.QUEEN, null), parser.parse("queen takes gee seven"))
    }

    @Test fun `file and rank homophones are normalized together`() {
        assertEquals(VoiceCommand.Play(Square("b4"), Square("c8"), null, null), parser.parse("bee for to see ate"))
    }

    @Test fun `promotion must be explicit and valid`() {
        val expected = VoiceCommand.Play(Square("e7"), Square("e8"), null, PieceType.QUEEN)
        assertEquals(expected, parser.parse("e seven to e eight promote to queen"))
        assertEquals(expected, parser.parse("e7e8q"))
        assertNull(parser.parse("e7 to e8 promote to king"))
    }

    @Test fun `unclear or malformed speech cannot become a guessed move`() {
        listOf("", "something else", "e8", "queen e9 to e8", "queen e nine to e eight", "a1 b1 c1", "e1 to e1", "queen rook to e8").forEach {
            assertNull(it, parser.parse(it))
        }
    }

    @Test fun `hands free navigation and board description commands work`() {
        val commands = mapOf(
            "please hint" to VoiceCommand.Hint, "next puzzle" to VoiceCommand.Next,
            "read the board" to VoiceCommand.ReadBoard, "repeat that" to VoiceCommand.Repeat,
            "try again" to VoiceCommand.Reset, "what can i say" to VoiceCommand.Help,
            "stop listening" to VoiceCommand.Stop,
        )
        commands.forEach { (phrase, expected) -> assertEquals(expected, parser.parse(phrase)) }
    }
}
