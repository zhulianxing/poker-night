@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.pokernight.tvdisplay.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.pokernight.tvdisplay.data.model.TableState
import com.pokernight.tvdisplay.data.network.TableViewModel
import com.pokernight.tvdisplay.ui.components.QrCodeCard
import com.pokernight.tvdisplay.ui.theme.*
import kotlinx.coroutines.delay

/**
 * Idle screen — shown when phase == "idle".
 *
 * Displays:
 * - Venue branding + welcome (decorative poker suits)
 * - Dual QR codes (app download + tournament pay), centered
 * - Auto-rotating tournament info carousel (5s per page) at the bottom
 * - Next tournament preview bar
 *
 * Visual language: deep poker-table look — green felt glow fading into a
 * deep-brown rail and near-black edges, with a refined muted gold accent.
 */
@Composable
fun IdleScreen(
    state: TableState,
    viewModel: TableViewModel,
    modifier: Modifier = Modifier,
) {
    val tableCode = state.tableCode
    val payUrl = "https://pokernight.cc/pay/pay.html?table=$tableCode"
    val downloadUrl = "https://pokernight.cc/download"

    // Carousel state
    var carouselPage by remember { mutableStateOf(0) }
    val carouselPages = remember {
        listOf(
            CarouselPage(
                title = "单桌限血赛规则",
                content = "初始筹码 1,000\n6人桌 · 单桌赛制\n最后存活者获胜",
            ),
            CarouselPage(
                title = "盲注递增",
                content = "起始盲注 10/20\n每 10 分钟翻倍\n合理分配筹码是关键",
            ),
            CarouselPage(
                title = "开赛条件",
                content = "满 6 人立即开赛\n或倒计时 5 分钟结束自动开赛\n至少 2 人方可激活赛事",
            ),
            CarouselPage(
                title = "入座与行为规范",
                content = "扫码免费入座\n每手操作时限 30 秒\n超时自动弃牌\n保持网络畅通",
            ),
        )
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(5000)
            carouselPage = (carouselPage + 1) % carouselPages.size
        }
    }

    // Entrance trigger for staggered QR cards.
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }

    // Breathing pulse for the tournament info (subtle alpha oscillation).
    val pulse = rememberInfiniteTransition().animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Reverse),
        label = "breathing",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                // Poker-table backdrop: green felt glow fading into brown rail + dark edges.
                Brush.radialGradient(
                    colors = listOf(
                        IdleTableGreen.copy(alpha = 0.55f),
                        IdleBrown,
                        Color(0xFF080503),
                    )
                )
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // === Header (centered, upper) ===
            // Decorative suit row
            Row(
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("♠", color = IdleGold, fontSize = 22.sp)
                Text("♥", color = RedAction, fontSize = 22.sp)
                Text("♦", color = RedAction, fontSize = 22.sp)
                Text("♣", color = IdleGold, fontSize = 22.sp)
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "POKER NIGHT",
                color = IdleGold,
                fontSize = 56.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Serif,
                letterSpacing = 8.sp,
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Gold divider
            Box(
                modifier = Modifier
                    .width(160.dp)
                    .height(2.dp)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color.Transparent,
                                IdleGold,
                                Color.Transparent,
                            )
                        )
                    ),
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "欢迎光临 · 扫码入座，开启你的牌局",
                color = TextSecondary,
                fontSize = 18.sp,
                letterSpacing = 2.sp,
            )

            // Push the QR row into the vertical center.
            Spacer(modifier = Modifier.weight(1f))

            // === QR codes (centered) ===
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AnimatedVisibility(
                    visible = entered,
                    enter = fadeIn(tween(700)) +
                        slideInVertically(tween(700)) { it / 3 },
                ) {
                    QrCodeCard(
                        url = downloadUrl,
                        title = "下载选手 APP",
                        description = "扫码下载 Poker Night 选手端 APP",
                        qrSize = 180,
                        accentColor = IdleGold,
                    )
                }

                Spacer(modifier = Modifier.width(56.dp))

                AnimatedVisibility(
                    visible = entered,
                    enter = fadeIn(tween(700, delayMillis = 200)) +
                        slideInVertically(tween(700, delayMillis = 200)) { it / 3 },
                ) {
                    QrCodeCard(
                        url = payUrl,
                        title = "发起赛事付费",
                        description = "扫码付费激活本场赛事",
                        qrSize = 180,
                        accentColor = IdleGold,
                    )
                }
            }

            // Push the bottom section down.
            Spacer(modifier = Modifier.weight(1f))

            // === Next tournament preview (breathing status) ===
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(CardBg.copy(alpha = 0.85f))
                    .border(1.dp, SeatBorder, RoundedCornerShape(14.dp))
                    .padding(18.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NextTournamentInfo(label = "下一场盲注", value = "${state.sb}/${state.bb}")
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(SeatBorder),
                )
                NextTournamentInfo(label = "人数上限", value = "6人")
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp)
                        .background(SeatBorder),
                )
                NextTournamentInfo(
                    label = "当前状态",
                    value = "等待激活",
                    valueAlpha = pulse.value,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // === Info carousel (bottom band) ===
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(168.dp),
                contentAlignment = Alignment.Center,
            ) {
                // Soft breathing glow behind the carousel.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .alpha(pulse.value * 0.22f)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    IdleGold.copy(alpha = 0.5f),
                                    Color.Transparent,
                                )
                            )
                        ),
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.82f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(16.dp))
                        .background(CardBg.copy(alpha = 0.9f))
                        .border(1.dp, SeatBorder, RoundedCornerShape(16.dp))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    AnimatedContent(
                        targetState = carouselPage,
                        transitionSpec = {
                            (slideInHorizontally(animationSpec = tween(450)) { it / 2 } + fadeIn(tween(450)))
                                .togetherWith(
                                    slideOutHorizontally(animationSpec = tween(450)) { -it / 2 } + fadeOut(tween(450))
                                )
                                .using(SizeTransform(clip = false))
                        },
                        label = "carousel",
                    ) { page ->
                        val carouselData = carouselPages[page]
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = carouselData.title,
                                color = IdleGold,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 2.sp,
                            )

                            Text(
                                text = carouselData.content,
                                color = TextPrimary,
                                fontSize = 16.sp,
                                lineHeight = 24.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )

                            // Page indicator dots
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                carouselPages.indices.forEach { index ->
                                    Box(
                                        modifier = Modifier
                                            .size(if (index == page) 8.dp else 6.dp)
                                            .clip(RoundedCornerShape(50))
                                            .background(
                                                if (index == page) IdleGold
                                                else IdleGold.copy(alpha = 0.3f)
                                            )
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NextTournamentInfo(
    label: String,
    value: String,
    valueAlpha: Float = 1f,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = label,
            color = TextTertiary,
            fontSize = 12.sp,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            color = IdleGold,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.alpha(valueAlpha),
        )
    }
}

private data class CarouselPage(
    val title: String,
    val content: String,
)
