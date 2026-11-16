package com.poracode.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.poracode.app.R

/**
 * Geist is the Poracode UI typeface (brand guide §7) and what the PWA renders.
 * Both families are the OFL-licensed variable fonts (`res/raw/geist_font_license.txt`);
 * each weight is an instance of the single variable file.
 */
private fun geist(resource: Int, vararg weights: FontWeight) = FontFamily(
    weights.map { weight ->
        Font(
            resource,
            weight = weight,
            variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
        )
    },
)

private val UiWeights = arrayOf(
    FontWeight.Normal,
    FontWeight.Medium,
    FontWeight.SemiBold,
    FontWeight.Bold,
)

val GeistSans: FontFamily = geist(R.font.geist, *UiWeights)
val GeistMono: FontFamily = geist(R.font.geist_mono, *UiWeights)

private fun style(
    size: Int,
    lineHeight: Int,
    weight: FontWeight = FontWeight.Normal,
    letterSpacing: TextUnit = 0.sp,
) = TextStyle(
    fontFamily = GeistSans,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = letterSpacing,
)

/**
 * Material text roles resized to the compact PWA scale: 14 sp page titles,
 * 13–14 sp body, 12 sp list titles, and 10–11 sp metadata, with no extra tracking.
 */
internal val PoracodeTypography = Typography(
    displayLarge = style(34, 40, FontWeight.SemiBold),
    displayMedium = style(28, 34, FontWeight.SemiBold),
    displaySmall = style(24, 30, FontWeight.SemiBold),
    headlineLarge = style(22, 28, FontWeight.SemiBold),
    headlineMedium = style(19, 25, FontWeight.SemiBold),
    headlineSmall = style(17, 23, FontWeight.SemiBold),
    titleLarge = style(16, 22, FontWeight.SemiBold),
    titleMedium = style(14, 20, FontWeight.SemiBold),
    titleSmall = style(13, 18, FontWeight.Medium),
    bodyLarge = style(15, 22),
    bodyMedium = style(14, 20),
    bodySmall = style(12, 16),
    labelLarge = style(13, 18, FontWeight.Medium),
    labelMedium = style(12, 16, FontWeight.Medium),
    labelSmall = style(10, 14, FontWeight.Medium),
)

/** Poracode-specific text roles that have no Material equivalent. */
object PoracodeTextStyles {
    /** Thread and list row titles (`text-xs`). */
    val rowTitle = style(12, 16)
    /** Row metadata such as project and host (`text-[10px]`). */
    val rowMeta = style(10, 14)
    /** Secondary line of settings, connection, and project rows (`text-[11px]`). */
    val rowDescription = style(11, 15)
    /** Compact relative times and counters in Geist Mono. */
    val monoMeta = TextStyle(fontFamily = GeistMono, fontSize = 10.sp, lineHeight = 12.sp)
    /** Tool activity summaries in the transcript. */
    val monoSummary = TextStyle(fontFamily = GeistMono, fontSize = 13.sp, lineHeight = 18.sp)
    /** Sheet and section headings (`text-[13px] font-semibold`). */
    val sheetTitle = style(13, 18, FontWeight.SemiBold)
    /** Page header title (`text-sm font-medium`). */
    val headerTitle = style(14, 20, FontWeight.Medium)
    /** Page header subtitle line. */
    val headerSubtitle = style(10, 14)
    /** Uppercase section labels (`text-[11px] uppercase tracking`). */
    val sectionLabel = style(11, 14, FontWeight.SemiBold, 0.6.sp)
}
