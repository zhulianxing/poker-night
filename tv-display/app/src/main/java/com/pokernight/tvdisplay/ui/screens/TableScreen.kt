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
        TopBar(state = state)
        Spacer(modifier = Modifier.height(8.dp))
        Box(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            PokerTableContent(state = state)
        }
        Spacer(modifier = Modifier.height(8.dp))
        BottomBar(handHistory = state.handHistory, onDisconnect = onDisconnect)
    }
}

/**
 * Poker table with rail frame + green felt.
 * 98% height + minimal padding = maximum room for 76×108dp cards between seat rows.
 */
@Composable
private fun PokerTableContent(state: TableState) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        // ── Dark table rail ──
        Box(
            modifier = Modifier
                .fillMaxWidth(0.93f)
                .fillMaxHeight(0.98f)
                .clip(RoundedCornerShape(100.dp))
                .background(RailDark)
                .padding(4.dp),
            contentAlignment = Alignment.Center,
        ) {
            // ── Green felt ──
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(97.dp))
                    .background(Brush.radialGradient(listOf(TableGreen, TableGreenDark))),
                contentAlignment = Alignment.Center,
            ) {
                // Top 3 seats
                SeatRow(state.seats, listOf(3, 4, 5),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 12.dp, start = 20.dp, end = 20.dp))
                // Bottom 3 seats
                SeatRow(state.seats, listOf(0, 1, 2),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 12.dp, start = 20.dp, end = 20.dp))
                // Center: cards + pot (slightly below geometric center for better balance)
                CenterArea(state, modifier = Modifier.align(Alignment.Center))
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
            val seat = seats.find { it.seatIndex == index } ?: PlayerSeat(seatIndex = index)
            PlayerSeatView(seat = seat)
        }
    }
}

/**
 * Center area: community cards (flop+) or large stage badge (preflop).
 * Pot always visible below cards/badge.
 */
@Composable
private fun CenterArea(
    state: TableState,
    modifier: Modifier = Modifier,
) {
    val potText = formatPot(state.pot)
    val cards = state.communityCards
    val hasCards = cards.isNotEmpty()
    val cardSpacing = 88.dp

    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        if (hasCards) {
            // ── Flop / Turn / River ──
            for (i in 0 until 5) {
                val card = cards.getOrNull(i)
                val xOffset = cardSpacing * (i - 2)
                PokerCardView(
                    card = card,
                    modifier = Modifier.align(Alignment.Center).offset(x = xOffset),
                    faceDown = card == null,
                )
            }
        } else {
            // ── Preflop: large stage label ──
            Box(
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 20.dp)
                    .background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 32.dp, vertical = 10.dp),
            ) {
                Text(
                    text = state.stage.uppercase().ifEmpty { "PREFLOP" },
                    color = GoldAccent,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 4.sp,
                )
            }
        }

        // ── Pot (always visible) ──
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 4.dp)
                .background(Color.Black.copy(alpha = 0.25f), RoundedCornerShape(16.dp))
                .padding(horizontal = 20.dp, vertical = 5.dp),
        ) {
            Text(
                text = "Pot: $potText",
                color = if (state.pot > 0) GoldAccent else TextTertiary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

private fun formatPot(pot: Int): String = when {
    pot >= 1_000_000 -> "${pot / 1_000_000}M"
    pot >= 1_000 -> "${pot / 1_000}K"
    else -> pot.toString()
}
