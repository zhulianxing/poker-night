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
 * Compact player seat box — shows all 6 positions around the table.
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

    // Blinking border when acting
    val infiniteTransition = rememberInfiniteTransition(label = "acting_blink")
    val borderAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(animation = tween(600), repeatMode = RepeatMode.Reverse),
        label = "border_alpha",
    )

    // If no data at all (seat doesn't exist in server data), show as placeholder
    val isPlaceholder = seat.status == PlayerStatus.EMPTY && seat.playerId.isEmpty()

    // Alpha: placeholder/eliminated ~50%, folded subtle, active 100%
    val seatAlpha = when {
        isPlaceholder -> 0.5f
        isEliminated -> 0.5f
        isFolded -> 0.4f
        else -> 1.0f
    }

    // Border styling
    val borderColor = when {
        isActing -> RedAction.copy(alpha = borderAlpha)
        isAllIn -> GoldAccent
        isEliminated || isPlaceholder -> SeatBorder.copy(alpha = 0.3f)
        else -> SeatBorder
    }
    val borderWidth = when {
        isActing || isAllIn -> 2.dp
        else -> 1.dp
    }

    // Background
    val bgColor = when {
        isPlaceholder -> SeatBg.copy(alpha = 0.2f)
        isEliminated -> SeatBg.copy(alpha = 0.3f)
        else -> SeatBg
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
        // ── Placeholder seat (no data) ──
        if (isPlaceholder) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("-", color = TextTertiary.copy(alpha = 0.4f), fontSize = 10.sp)
            }
        }
        // ── Eliminated seat ──
        else if (isEliminated) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = seat.avatar.ifEmpty { "\uD83C\uDCCF" },
                        fontSize = 12.sp,
                    )
                    Text(
                        text = seat.nickname.ifEmpty { "P${seat.seatIndex + 1}" },
                        color = TextPrimary.copy(alpha = 0.6f),
                        fontSize = 11.sp,
                        maxLines = 1,
                    )
                }
                Text(
                    text = formatChipCount(seat.chipCount),
                    color = ChipGreen.copy(alpha = 0.5f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        // ── Active seat (playing/folded/all-in) ──
        else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Left: avatar + name + dealer button
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
                        color = TextPrimary,
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
                    Text(
                        text = formatChipCount(seat.chipCount),
                        color = ChipGreen,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    if (seat.lastAction.isNotEmpty()) {
                        Text(seat.lastAction, color = TextSecondary, fontSize = 10.sp, maxLines = 1)
                    } else {
                        val statusText = when (seat.status) {
                            PlayerStatus.FOLDED -> "Fold"
                            PlayerStatus.ALL_IN -> "All-In"
                            PlayerStatus.WAITING -> "Wait"
                            else -> ""
                        }
                        if (statusText.isNotEmpty()) {
                            Text(statusText, color = TextTertiary, fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
}

private fun formatChipCount(count: Int): String {
    return when {
        count >= 1_000_000 -> "${count / 1_000_000}M"
        count >= 1_000 -> "${count / 1_000}K"
        else -> count.toString()
    }
}
