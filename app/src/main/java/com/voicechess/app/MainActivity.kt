package com.voicechess.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.voicechess.app.ui.VoiceChessScreen
import com.voicechess.app.ui.VoiceChessTheme
import com.voicechess.app.voice.VoiceSessionController
import com.voicechess.core.VoiceCommand
import com.voicechess.core.VoiceCommandParser

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        setContent {
            val model: PuzzleViewModel = viewModel()
            val puzzle by model.state.collectAsStateWithLifecycle()
            val solved by model.solvedIds.collectAsStateWithLifecycle()
            val voice = remember { VoiceSessionController(this, model::submit) }
            val parser = remember { VoiceCommandParser() }
            val audio by voice.state.collectAsStateWithLifecycle()
            val lifecycleOwner = LocalLifecycleOwner.current
            val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                if (granted) voice.start(model.state.value.introduction) else voice.permissionDenied()
            }
            DisposableEffect(lifecycleOwner, voice) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_STOP) voice.pause("Voice paused while the app was in the background.")
                }
                lifecycleOwner.lifecycle.addObserver(observer)
                onDispose {
                    lifecycleOwner.lifecycle.removeObserver(observer)
                    voice.close()
                }
            }
            VoiceChessTheme {
                VoiceChessScreen(
                    state = puzzle,
                    puzzleCount = model.puzzleCount,
                    solvedCount = solved.size,
                    audio = audio,
                    onVoiceToggle = {
                        if (audio.active) voice.pause()
                        else if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            voice.start(if (puzzle.solved) "Puzzle solved. Say next puzzle to continue." else puzzle.introduction)
                        } else permission.launch(Manifest.permission.RECORD_AUDIO)
                    },
                    onCommand = { command: VoiceCommand -> voice.respond(model.execute(command)) },
                    onTypedMove = { move ->
                        val message = model.submit(move)
                        if (parser.parse(move) == VoiceCommand.Stop) voice.pause() else voice.respond(message)
                    },
                    onSettings = {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:$packageName".toUri()))
                    },
                )
            }
        }
    }
}
