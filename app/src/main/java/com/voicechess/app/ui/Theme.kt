package com.voicechess.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Lime = Color(0xFFB9E37B)
val Forest = Color(0xFF101510)
val Panel = Color(0xFF1B221A)
val Muted = Color(0xFFA4B09C)

private val Colors = darkColorScheme(
    primary = Lime,
    onPrimary = Forest,
    background = Forest,
    onBackground = Color(0xFFE9EDDF),
    surface = Panel,
    onSurface = Color(0xFFE9EDDF),
    surfaceVariant = Color(0xFF2A3527),
    onSurfaceVariant = Muted,
    outline = Color(0xFF48513F),
)

@Composable
fun VoiceChessTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Typography(), content = content)
}
