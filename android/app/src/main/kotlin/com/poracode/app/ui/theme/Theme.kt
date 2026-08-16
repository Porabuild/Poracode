package com.poracode.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val PoracodeDark = darkColorScheme(
    primary = Color(0xFFB5A7FF),
    onPrimary = Color(0xFF1B1040),
    primaryContainer = Color(0xFF3A2F6B),
    onPrimaryContainer = Color(0xFFE6DEFF),
    secondary = Color(0xFFCAC3DC),
    onSecondary = Color(0xFF322E41),
    background = Color(0xFF070709),
    onBackground = Color(0xFFE6E1E6),
    surface = Color(0xFF121016),
    onSurface = Color(0xFFE6E1E6),
    surfaceVariant = Color(0xFF2A2630),
    onSurfaceVariant = Color(0xFFCBC4D2),
    error = Color(0xFFFFB4AB),
)

private val PoracodeLight = lightColorScheme(
    primary = Color(0xFF5B4CB8),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE6DEFF),
    onPrimaryContainer = Color(0xFF17004A),
    secondary = Color(0xFF615B71),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFFCF8FF),
    onBackground = Color(0xFF1C1B1F),
    surface = Color(0xFFFCF8FF),
    onSurface = Color(0xFF1C1B1F),
    surfaceVariant = Color(0xFFE7E0EC),
    onSurfaceVariant = Color(0xFF49454E),
    error = Color(0xFFBA1A1A),
)

@Composable
fun PoracodeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> PoracodeDark
        else -> PoracodeLight
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
