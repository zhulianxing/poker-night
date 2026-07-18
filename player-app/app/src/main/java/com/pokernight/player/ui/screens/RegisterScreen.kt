package com.pokernight.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pokernight.player.data.GameViewModel
import com.pokernight.player.ui.theme.BgDark
import com.pokernight.player.ui.theme.Gold
import com.pokernight.player.ui.theme.White

@Composable
fun RegisterScreen(
    viewModel: GameViewModel,
    onRegisterSuccess: () -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val codeCountdown by viewModel.codeCountdown.collectAsState()
    val isCodeSending by viewModel.isCodeSending.collectAsState()
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(uiState.isLoggedIn) {
        if (uiState.isLoggedIn) onRegisterSuccess()
    }

    val isEmailValid = email.contains("@") && email.contains(".")

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "♠ 注册账号 ♠",
                fontSize = 28.sp,
                color = Gold,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(32.dp))

            // Email
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("邮箱", color = White.copy(alpha = 0.6f)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = White,
                    unfocusedTextColor = White,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = White.copy(alpha = 0.3f),
                    cursorColor = Gold,
                ),
                textStyle = TextStyle(fontSize = 16.sp),
            )
            Spacer(Modifier.height(12.dp))

            // Code + Send button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { if (it.length <= 6) code = it.filter { c -> c.isDigit() } },
                    label = { Text("验证码", color = White.copy(alpha = 0.6f)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = White,
                        unfocusedTextColor = White,
                        focusedBorderColor = Gold,
                        unfocusedBorderColor = White.copy(alpha = 0.3f),
                        cursorColor = Gold,
                    ),
                    textStyle = TextStyle(fontSize = 16.sp),
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = { viewModel.sendCode(email, "register") },
                    enabled = isEmailValid && !isCodeSending,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Gold,
                        contentColor = BgDark,
                        disabledContainerColor = Gold.copy(alpha = 0.3f),
                        disabledContentColor = BgDark.copy(alpha = 0.5f),
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(56.dp),
                ) {
                    Text(
                        text = if (codeCountdown > 0) "${codeCountdown}s" else "发送验证码",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))

            // Nickname
            OutlinedTextField(
                value = nickname,
                onValueChange = { nickname = it },
                label = { Text("昵称", color = White.copy(alpha = 0.6f)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = White,
                    unfocusedTextColor = White,
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = White.copy(alpha = 0.3f),
                    cursorColor = Gold,
                ),
                textStyle = TextStyle(fontSize = 16.sp),
            )
            Spacer(Modifier.height(8.dp))

            val displayError = error ?: uiState.error
            displayError?.let { err ->
                Text(
                    text = err,
                    color = Color.Red,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
            }

            if (uiState.isLoading) {
                CircularProgressIndicator(color = Gold, modifier = Modifier.height(40.dp))
            } else {
                Button(
                    onClick = {
                        error = null
                        when {
                            email.isBlank() -> error = "请输入邮箱"
                            !isEmailValid -> error = "邮箱格式不正确"
                            code.length < 6 -> error = "请输入6位验证码"
                            nickname.isBlank() -> error = "请输入昵称"
                            else -> viewModel.register(email, code, nickname)
                        }
                    },
                    enabled = isEmailValid && code.length == 6 && nickname.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Gold,
                        contentColor = BgDark,
                        disabledContainerColor = Gold.copy(alpha = 0.3f),
                        disabledContentColor = BgDark.copy(alpha = 0.5f),
                    ),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("注册", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(16.dp))

            TextButton(onClick = {
                viewModel.clearError()
                onBack()
            }) {
                Text("已有账号？返回登录", color = Gold.copy(alpha = 0.8f), fontSize = 14.sp)
            }
        }
    }
}
