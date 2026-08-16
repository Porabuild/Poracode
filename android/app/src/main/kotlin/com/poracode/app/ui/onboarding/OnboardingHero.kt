package com.poracode.app.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.ui.components.BrandWordmark

/** Launcher-art mark size; matches the iOS hero mark and the web welcome icon. */
private val MarkSize = 78.dp

/**
 * Centered hero: the real app icon, the Pora·code wordmark as the heading, and the
 * one-line explanation of what to do next.
 *
 * The mark is the launcher artwork rendered untinted and clipped to a rounded square
 * (radius ≈ 26% of the size, the platform-neutral squircle approximation both other
 * clients use), lifted by a brand-tinted shadow. It is decorative: the wordmark right
 * below it already announces the product.
 */
@Composable
internal fun OnboardingHero(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AnimatedBrandMark(size = MarkSize)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BrandWordmark(
                style = MaterialTheme.typography.headlineSmall,
                color = OnboardingForeground,
                dotColor = OnboardingViolet,
                isHeading = true,
            )
            Text(
                stringResource(R.string.pair_instructions),
                style = MaterialTheme.typography.bodyMedium,
                color = OnboardingMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(0.82f),
            )
        }
    }
}
