package com.voicechess.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.voicechess.app.voice.VoicePhase
import com.voicechess.app.voice.VoiceState
import com.voicechess.core.BundledPuzzleRepository
import com.voicechess.core.PuzzleSession
import com.voicechess.core.SessionState
import com.voicechess.core.VoiceCommand

@Composable
fun VoiceChessScreen(
    state: SessionState,
    puzzleCount: Int,
    solvedCount: Int,
    audio: VoiceState,
    onVoiceToggle: () -> Unit,
    onCommand: (VoiceCommand) -> Unit,
    onTypedMove: (String) -> Unit,
    onSettings: () -> Unit,
) {
    var showHelp by rememberSaveable { mutableStateOf(false) }
    var showTyping by rememberSaveable { mutableStateOf(false) }
    var typedMove by rememberSaveable { mutableStateOf("") }
    fun submitTyped() {
        if (typedMove.isNotBlank()) {
            onTypedMove(typedMove)
            typedMove = ""
        }
    }
    Scaffold(containerColor = Forest, bottomBar = {
        VoiceControls(audio, onVoiceToggle)
    }) { insets ->
        Box(Modifier.padding(insets).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 520.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("voice chess", fontFamily = FontFamily.Serif, fontSize = 27.sp, fontWeight = FontWeight.Bold)
                    Surface(color = Panel, shape = RoundedCornerShape(24.dp)) {
                        Text("$solvedCount / $puzzleCount solved", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Lime, fontSize = 12.sp)
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("A MOMENT FOR YOUR MIND", color = Muted, letterSpacing = 2.sp, fontSize = 10.sp)
                    Text(
                        if (state.solved) "Nicely played." else "Your next move.\nOut loud.",
                        color = Lime, fontFamily = FontFamily.Serif, fontSize = 35.sp, lineHeight = 39.sp,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(if (state.solved) "One good idea. One puzzle solved." else "Find the move. Let your voice do the rest.", color = Muted, fontSize = 14.sp)
                }
                Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(22.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("PUZZLE ${(state.puzzleIndex + 1).toString().padStart(2, '0')}", color = Muted, fontSize = 10.sp, letterSpacing = 1.5.sp)
                                Text(state.puzzle.title, fontSize = 20.sp, fontFamily = FontFamily.Serif)
                            }
                            Surface(color = Color(0xFF2A3527), shape = RoundedCornerShape(8.dp)) {
                                Text(state.puzzle.goal, Modifier.padding(8.dp), color = Lime, fontSize = 11.sp)
                            }
                        }
                        ChessBoard(state.board, state.lastMove)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(7.dp).background(if (state.solved) Lime else Color(0xFFF1EEDD), CircleShape))
                                Spacer(Modifier.width(7.dp))
                                Text(if (state.solved) "Puzzle complete" else "${state.board.turn.label} to move", fontSize = 12.sp)
                            }
                            Text(state.puzzle.theme, color = Muted, fontSize = 11.sp)
                        }
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(state.message, color = if (state.solved) Lime else MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp, lineHeight = 21.sp, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    if (state.history.isNotEmpty()) Text(state.history.joinToString(" → "), color = Muted, fontSize = 11.sp)
                    if (audio.transcript.isNotEmpty()) Text("Heard: “${audio.transcript}”", color = Muted, fontSize = 12.sp)
                }
                if (!audio.active) Text(
                        if (audio.onDevice) "On-device recognition is preferred. English model availability depends on your device."
                        else "Your device's speech service may send audio online to recognize it.",
                        color = Muted, fontSize = 11.sp, lineHeight = 16.sp,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onCommand(VoiceCommand.Hint) }, modifier = Modifier.weight(1f)) { Text("Hint") }
                    OutlinedButton(onClick = { onCommand(VoiceCommand.Reset) }, modifier = Modifier.weight(1f)) { Text("Reset") }
                    OutlinedButton(onClick = { onCommand(VoiceCommand.Next) }, modifier = Modifier.weight(1f)) { Text("Next") }
                }
                HorizontalDivider(color = Color(0xFF2B3528))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("JUST SAY THE MOVE", color = Muted, fontSize = 10.sp, letterSpacing = 1.5.sp)
                    Text("“e one to e eight”  ·  “rook to e eight”", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
                    Text("Or say “hint”, “read board”, “next puzzle” or “stop”.", color = Muted, fontSize = 12.sp)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { showHelp = true }) { Text("Voice guide") }
                        TextButton(onClick = { showTyping = !showTyping }) { Text(if (showTyping) "Hide keyboard" else "Type a move") }
                    }
                    if (showTyping) {
                        OutlinedTextField(
                            value = typedMove, onValueChange = { typedMove = it }, label = { Text("Your move or command") },
                            placeholder = { Text("e1 to e8") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                            keyboardActions = KeyboardActions(onSend = { submitTyped() }),
                        )
                        Button(onClick = { submitTyped() }, enabled = typedMove.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Submit") }
                    }
                }
            }
        }
    }
    if (showHelp) AlertDialog(
        onDismissRequest = { showHelp = false },
        title = { Text("Play with your voice") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Tap Start voice and allow microphone access. Wait until the app finishes speaking, then say your move.")
                Text("Moves: “e one to e eight”, “rook to e eight”, or “echo one to echo eight”. Say the source square when two pieces can reach the same destination.")
                Text("Commands: hint, read board, repeat, reset, next puzzle, help, stop.")
                Text("Sessions pause after two minutes, repeated silence, or leaving the app. The keyboard is available whenever you need it.")
                TextButton(onClick = onSettings) { Text("Open microphone settings") }
            }
        },
        confirmButton = { TextButton(onClick = { showHelp = false }) { Text("Got it") } },
    )
}

@Composable
private fun VoiceControls(audio: VoiceState, onVoiceToggle: () -> Unit) {
    Surface(color = Forest, shadowElevation = 10.dp) {
        Box(Modifier.fillMaxWidth().navigationBarsPadding().imePadding(), contentAlignment = Alignment.Center) {
            Column(Modifier.widthIn(max = 520.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onVoiceToggle, enabled = audio.available,
                    modifier = Modifier.fillMaxWidth().height(58.dp), shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Lime, contentColor = Forest)) {
                    MicrophoneIcon(Modifier.size(21.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(when {
                        !audio.available -> "Speech service unavailable"
                        audio.active -> "Pause voice"
                        else -> "Start voice"
                    }, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    val phase = when (audio.phase) {
                        VoicePhase.LISTENING -> "LISTENING"
                        VoicePhase.PROCESSING -> "THINKING"
                        VoicePhase.SPEAKING -> "SPEAKING"
                        VoicePhase.IDLE -> if (audio.onDevice) "ON-DEVICE SPEECH" else "DEVICE SPEECH SERVICE"
                    }
                    Box(Modifier.size(6.dp).background(if (audio.active) Lime else Muted, CircleShape))
                    Spacer(Modifier.width(7.dp))
                    Text(phase, color = Muted, fontSize = 10.sp, letterSpacing = 1.sp)
                }
                Text(if (audio.available) audio.detail else "Install or enable a speech service, or use Type a move.",
                    color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
            }
        }
    }
}

@Composable
private fun MicrophoneIcon(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val color = Forest
        val stroke = size.width * 0.09f
        drawRoundRect(color, topLeft = Offset(size.width * 0.35f, 0f),
            size = androidx.compose.ui.geometry.Size(size.width * 0.3f, size.height * 0.6f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.width * 0.15f), style = Stroke(stroke))
        drawArc(color, startAngle = 0f, sweepAngle = 180f, useCenter = false,
            topLeft = Offset(size.width * 0.16f, size.height * 0.3f),
            size = androidx.compose.ui.geometry.Size(size.width * 0.68f, size.height * 0.5f), style = Stroke(stroke, cap = StrokeCap.Round))
        drawLine(color, Offset(size.width / 2, size.height * 0.8f), Offset(size.width / 2, size.height), stroke, cap = StrokeCap.Round)
    }
}

@Preview(showBackground = true, widthDp = 412, heightDp = 1000)
@Composable
private fun VoiceChessPreview() {
    VoiceChessTheme {
        VoiceChessScreen(PuzzleSession(BundledPuzzleRepository().puzzles()).start(), 3, 0,
            VoiceState(available = true, onDevice = true), {}, {}, {}, {})
    }
}
