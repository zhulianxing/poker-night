@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.pokernight.tvdisplay.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.Text
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.pokernight.tvdisplay.data.model.PlayerSeat
import com.pokernight.tvdisplay.data.model.TableState
import com.pokernight.tvdisplay.ui.components.BottomBar
import com.pokernight.tvdisplay.ui.components.PlayerSeatView
import com.pokernight.tvdisplay.ui.components.PokerCardView
import com.pokernight.tvdisplay.ui.components.TopBar
import com.pokernight.tvdisplay.ui.theme.*

/**
 * Main table screen — shows the full poker table with seats, community cards, and pot.
 * Only used when phase == "started".
 */
@Composable
fun TableScreen(
    state: TableState,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        // Top bar
        TopBar(state = state)

        Spacer(modifier = Modifier.height(8.dp))

        // Center: Poker table
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            PokerTableContent(state = state)
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Bottom bar
        BottomBar(
            handHistory = state.handHistory,
            onDisconnect = onDisconnect,
        )
    }
}

/**
 * The poker table with 6 seats arranged (3 top, 3 bottom) and community cards in center.
 */
@Composable
private fun PokerTableContent(state: TableState) {
    Box(
        modifier = Modifier
            .fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        // Table oval background
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(0.85f)
                .clip(RoundedCornerShape(120.dp))
                .background(
                    Brush.radialGradient(
                        colors = listOf(TableGreen, TableGreenDark),
                    )
                ),
        ) {
            // Table content
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                // Top 3 seats
                SeatRow(
                    seats = state.seats,
                    indices = listOf(3, 4, 5),
                    modifier = Modifier.padding(top = 16.dp, start = 24.dp, end = 24.dp),
                )

                // Center: community cards + pot
                CenterArea(state = state)

                // Bottom 3 seats
                SeatRow(
                    seats = state.seats,
                    indices = listOf(0, 1, 2),
                    modifier = Modifier.padding(bottom = 16.dp, start = 24.dp, end = 24.dp),
                )
            }
        }
    }
}

/**
 * Row of 3 seats.
 */
@Composable
private fun SeatRow(
    seats: List<PlayerSeat>,
    indices: List<Int>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        indices.forEach { index ->
            val seat = seats.getOrNull(index) ?: PlayerSeat(seatIndex = index)
            PlayerSeatView(seat = seat)
        }
    }
}

/**
 * Center area with community cards and pot.
 * Mainstream poker broadcast layout: cards centered, stage badge, pot info below.
 * Uses Box with absolute positioning (works around Android TV multi-child bug).
 */
@Composable
private fun CenterArea(state: TableState) {
    val potText = formatPot(state.pot)
    val cards = state.communityCards
    val cardSpacing = 97.dp  // 76w + 21dp gap between cards

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        // ── Stage badge (top of center area) ──
        if (state.stage.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = 2.dp)
                    .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 12.dp, vertical = 3.dp),
            ) {
                Text(
                    text = state.stage.uppercase(),
                    color = GoldAccent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp,
                )
            }
        }

        // ── Community cards row (5 slots) ──
        for (i in 0 until 5) {
            val card = cards.getOrNull(i)
            val xOffset = cardSpacing * (i - 2)
            PokerCardView(
                card = card,
                modifier = Modifier.align(Alignment.Center).offset(x = xOffset),
            )
        }

        // ── Pot (below cards) ──
        if (state.pot > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .offset(y = (-12).dp)
                    .background(
                        color = Color.Black.copy(alpha = 0.25f),
                        shape = RoundedCornerShape(16.dp),
                    )
                    .padding(horizontal = 20.dp, vertical = 6.dp),
            ) {
                Text(
                    text = "Pot: $potText",
                    color = GoldAccent,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}


private fun formatPot(pot: Int): String {
    return when {
        pot >= 1_000_000 -> "${pot / 1_000_000}M"
        pot >= 1_000 -> "${pot / 1_000}K"
        else -> pot.toString()
    }
}