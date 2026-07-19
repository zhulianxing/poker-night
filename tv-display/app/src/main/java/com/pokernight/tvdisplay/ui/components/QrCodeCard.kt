@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.pokernight.tvdisplay.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.pokernight.tvdisplay.ui.theme.*
import com.pokernight.tvdisplay.ui.util.generateQrCode

/**
 * A reusable QR code card with title and description.
 * Used in IdleScreen and WaitingScreen.
 *
 * Polish: gold glow shadow, rounded gold-tinted border, and a prominent
 * header title for clearer scannable guidance.
 *
 * @param accentColor border / glow / title accent (defaults to global GoldAccent
 *        so WaitingScreen keeps its original look).
 */
@Composable
fun QrCodeCard(
    url: String,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    qrSize: Int = 160,
    accentColor: Color = GoldAccent,
) {
    var qrBitmap by remember(url) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(url) {
        qrBitmap = generateQrCode(url)
    }

    Column(
        modifier = modifier
            .shadow(
                elevation = 14.dp,
                shape = RoundedCornerShape(16.dp),
                ambientColor = accentColor.copy(alpha = 0.40f),
                spotColor = accentColor.copy(alpha = 0.40f),
            )
            .clip(RoundedCornerShape(16.dp))
            .background(CardBg)
            .border(
                width = 1.5.dp,
                color = accentColor.copy(alpha = 0.55f),
                shape = RoundedCornerShape(16.dp),
            )
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Header title
        Text(
            text = title,
            color = accentColor,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
        )

        if (qrBitmap != null) {
            Image(
                bitmap = qrBitmap!!.asImageBitmap(),
                contentDescription = title,
                modifier = Modifier
                    .size(qrSize.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .border(2.dp, accentColor.copy(alpha = 0.6f), RoundedCornerShape(10.dp)),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(qrSize.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(SeatBg)
                    .border(2.dp, SeatBorder, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Loading…",
                    color = TextTertiary,
                    fontSize = 12.sp,
                )
            }
        }

        Text(
            text = description,
            color = TextSecondary,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 200.dp),
        )
    }
}
