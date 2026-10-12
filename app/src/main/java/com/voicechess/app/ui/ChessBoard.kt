package com.voicechess.app.ui

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.voicechess.core.Board
import com.voicechess.core.Move
import com.voicechess.core.Piece
import com.voicechess.core.Side
import com.voicechess.core.Square

@Composable
fun ChessBoard(board: Board, lastMove: Move?, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp))) {
        for (rank in 7 downTo 0) {
            Row(Modifier.weight(1f)) {
                for (file in 0..7) {
                    val square = Square.at(file, rank)
                    val piece = board.pieces[square]
                    val light = (rank + file) % 2 == 1
                    val highlighted = square == lastMove?.from || square == lastMove?.to
                    val color = when {
                        highlighted -> Color(0xFFB9CD70)
                        light -> Color(0xFFD3DAC3)
                        else -> Color(0xFF708265)
                    }
                    Box(
                        Modifier.weight(1f).fillMaxSize().background(color).clearAndSetSemantics {
                            contentDescription = "${square.spoken}, ${piece?.description ?: "empty"}"
                        },
                    ) {
                        if (piece != null) ChessPiece(piece)
                        val labelColor = if (light || highlighted) Color(0xFF516348) else Color(0xFFE2E8D7)
                        if (file == 0) Text("${rank + 1}", Modifier.align(Alignment.TopStart).padding(start = 3.dp), color = labelColor, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                        if (rank == 0) Text("${'a' + file}", Modifier.align(Alignment.BottomEnd).padding(end = 3.dp), color = labelColor, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChessPiece(piece: Piece) {
    Canvas(Modifier.fillMaxSize()) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size.minDimension * 0.78f
            textAlign = Paint.Align.CENTER
            typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
        }
        val y = size.height / 2 - (paint.ascent() + paint.descent()) / 2
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = size.minDimension * 0.025f
        paint.color = if (piece.side == Side.WHITE) 0xFF35412F.toInt() else 0xFFD3DAC3.toInt()
        drawContext.canvas.nativeCanvas.drawText(piece.type.glyph, size.width / 2, y, paint)
        paint.style = Paint.Style.FILL
        paint.color = if (piece.side == Side.WHITE) 0xFFF8F7EB.toInt() else 0xFF1B2317.toInt()
        drawContext.canvas.nativeCanvas.drawText(piece.type.glyph, size.width / 2, y, paint)
    }
}
