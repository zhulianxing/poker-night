@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.pokernight.tvdisplay.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.pokernight.tvdisplay.data.model.PlayerSeat
import com.pokernight.tvdisplay.data.model.PlayerStatus
import com.pokernight.tvdisplay.ui.theme.*

/**
 * Player seat box — uniform layout for all 6 positions.
 *
 * Every seat with data (active, folded, all-in, or eliminated) renders
 * the same avatar+name+chips+status layout. Only truly empty placeholders
 * (no server data at all) get a minimal dash.
 */
@Composable
fun PlayerSeatView(
    seat: PlayerSeat,
    modifier: Modifier = Modifier,
) {
    val isEmpty = seat.status == PlayerStatus.EMPTY
    val isEliminated = seat.status == PlayerStatus.ELIMINATED
    val isFolded = seat.status == PlayerStatus.FOLDED
    val isAllIn = seat.status == PlayerStatus.ALL_IN
    val isActing = seat.isActing

    // Blinking border for active player
    val infiniteTransition = rememberInfiniteTransition(label = "acting_blink")
    val blinkAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(animation = tween(600), repeatMode = RepeatMode.Reverse),
        label = "border_alpha",
    )

    // True placeholder vs eliminated-with-data
    val isPlaceholder = isEmpty && seat.playerId.isEmpty()
    val hasData = !isPlaceholder && (isEliminated || !isEmpty)

    // ── Border ──
    val borderColor = when {
        isActing -> RedAction.copy(alpha = blinkAlpha)
        isAllIn -> GoldAccent
        isPlaceholder -> SeatBorder.copy(alpha = 0.2f)
        isEliminated -> SeatBorder.copy(alpha = 0.5f)
        else -> SeatBorder
    }
    val borderWidth = when {
        isActing || isAllIn -> 2.dp
        else -> 1.dp
    }

    // ── Background ──
    val bgColor = when {
        isPlaceholder -> SeatBg.copy(alpha = 0.15f)
        else -> SeatBg
    }

    // ── Overall alpha (consistent across all seats) ──
    val seatAlpha = when {
        isPlaceholder -> 0.4f
        else -> 0.85f
    }

    Box(
        modifier = modifier
            .width(140.dp)
            .height(52.dp)
            .alpha(seatAlpha)
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .border(borderWidth, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (isPlaceholder) {
            // ── Empty slot: minimal dash ──
            Text(
                "—",
                color = TextTertiary.copy(alpha = 0.3f),
                fontSize = 10.sp,
                modifier = Modifier.fillMaxWidth().wrapContentWidth(Alignment.CenterHorizontally),
            )
        } else {
            // ── Uniform layout for ALL seats with data ──
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Left: avatar + name (+ dealer badge)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = seat.avatar.ifEmpty { "\uD83C\uDCCF" },
                        fontSize = 14.sp,
                    )
                    Text(
                        text = seat.nickname.ifEmpty { "P${seat.seatIndex + 1}" },
                        color = if (isEliminated) TextPrimary.copy(alpha = 0.6f) else TextPrimary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    if (seat.isDealer) {
                        Box(
                            modifier = Modifier
                                .size(16.dp)
                                .clip(CircleShape)
                                .background(GoldAccent),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("D", color = Color.Black, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Right: chips + status
                Column(horizontalAlignment = Alignment.End) {
                    val textColor = if (isEliminated) ChipGreen.copy(alpha = 0.5f) else ChipGreen
                    Text(
                        text = formatChipCount(seat.chipCount),
                        color = textColor,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    StatusText(seat)
                }
            }
        }
    }
}

/**
 * Status line — shows action text, status badge, or OUT for eliminated.
 */
@Composable
private fun StatusText(seat: PlayerSeat) {
    val statusText = when (seat.status) {
        PlayerStatus.ELIMINATED -> "OUT"
        PlayerStatus.FOLDED -> "Fold"
        PlayerStatus.ALL_IN -> "All-In"
        PlayerStatus.WAITING -> "Wait"
        else -> null
    }
    val actionText = seat.lastAction.takeIf { it.isNotEmpty() }

    val text = actionText ?: statusText ?: ""
    val color = when (seat.status) {
        PlayerStatus.ELIMINATED -> RedAction.copy(alpha = 0.6f)
        PlayerStatus.FOLDED -> TextTertiary
        PlayerStatus.ALL_IN -> GoldAccent
        else -> TextSecondary
    }

    if (text.isNotEmpty()) {
        Text(text, color = color, fontSize = 10.sp, maxLines = 1)
    }
}

private fun formatChipCount(count: Int): String {
    return when {
        count >= 1_000_000 -> "${count / 1_000_000}M"
        count >= 1_000 -> "${count / 1_000}K"
        else -> count.toString()
    }
}
