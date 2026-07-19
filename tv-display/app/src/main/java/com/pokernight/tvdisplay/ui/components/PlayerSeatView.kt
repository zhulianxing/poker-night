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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.pokernight.tvdisplay.data.model.PlayerSeat
import com.pokernight.tvdisplay.data.model.PlayerStatus
import com.pokernight.tvdisplay.ui.theme.*

/**
 * Compact player seat box — smaller to leave room for big cards.
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

    val infiniteTransition = rememberInfiniteTransition(label = "acting_blink")
    val borderAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(animation = tween(600), repeatMode = RepeatMode.Reverse),
        label = "border_alpha",
    )

    val seatAlpha = when {
        isEliminated -> EliminatedAlpha
        isFolded -> FoldedAlpha
        isEmpty -> 0.15f
        else -> 1.0f
    }

    val borderColor = when {
        isActing -> RedAction.copy(alpha = borderAlpha)
        isAllIn -> GoldAccent
        else -> SeatBorder
    }

    val statusColor = when {
        isAllIn -> GoldAccent
        isFolded -> TextTertiary
        isEliminated -> TextTertiary
        seat.status == PlayerStatus.WAITING -> GoldAccent.copy(alpha = 0.6f)
        else -> TextSecondary
    }

    Box(
        modifier = modifier
            .width(140.dp)
            .height(56.dp)
            .alpha(seatAlpha)
            .clip(RoundedCornerShape(8.dp))
            .background(SeatBg)
            .border(
                width = if (isActing || isAllIn) 2.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (isEmpty) {
            Text("Empty", color = TextTertiary, fontSize = 11.sp)
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Left: avatar + name + dealer
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
                        Text(seat.lastAction, color = statusColor, fontSize = 10.sp, maxLines = 1)
                    } else if (!isEmpty && seat.status != PlayerStatus.PLAYING) {
                        Text(
                            text = when (seat.status) {
                                PlayerStatus.FOLDED -> "Fold"
                                PlayerStatus.ALL_IN -> "All-In"
                                PlayerStatus.ELIMINATED -> "Elim"
                                PlayerStatus.WAITING -> "Wait"
                                else -> ""
                            },
                            color = statusColor,
                            fontSize = 10.sp,
                        )
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
