package com.voicechess.app

import android.app.Application
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import com.voicechess.core.BundledPuzzleRepository
import com.voicechess.core.PuzzleSession
import com.voicechess.core.VoiceCommand
import com.voicechess.core.VoiceCommandParser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class PuzzleViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("puzzle_progress", Application.MODE_PRIVATE)
    private val session = PuzzleSession(BundledPuzzleRepository().puzzles())
    private val parser = VoiceCommandParser()
    private val _state = MutableStateFlow(session.start())
    val state = _state.asStateFlow()
    val puzzleCount = session.count
    private val _solvedIds = MutableStateFlow(preferences.getStringSet("solved", emptySet())!!.toSet())
    val solvedIds = _solvedIds.asStateFlow()

    fun submit(transcript: String): String = execute(parser.parse(transcript))

    fun execute(command: VoiceCommand?): String {
        val updated = session.handle(_state.value, command)
        _state.value = updated
        if (updated.solved && updated.puzzle.id !in _solvedIds.value) {
            _solvedIds.value += updated.puzzle.id
            preferences.edit { putStringSet("solved", _solvedIds.value) }
        }
        return updated.message
    }
}
