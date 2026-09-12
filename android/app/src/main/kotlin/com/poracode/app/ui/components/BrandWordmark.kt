package com.poracode.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em

/** Accessible name of the whole mark — it reads as one product name, not three parts. */
private const val WORDMARK_LABEL = "Poracode"
private const val DOT_SLOT = "pora-dot"

/**
 * The Pora·code brand wordmark — bold "Pora", the accent dot on the baseline, and
 * semibold "code". Mirrors the web `BrandWordmark` and the brand guide.
 *
 * The dot is a **drawn circle**, never a typed period: the geometric sans faces the
 * apps ship render "." as a square, which is wrong for this mark. It is laid out as
 * inline text content aligned `AboveBaseline`, so its bottom edge sits exactly on
 * the text baseline at every font size and font scale.
 *
 * The parts are hidden from assistive tech and the whole mark exposes a single
 * "Poracode" description.
 */
@Composable
fun BrandWordmark(
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    dotColor: Color = MaterialTheme.colorScheme.primary,
    isHeading: Boolean = false,
) {
    val mark = buildAnnotatedString {
        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Pora") }
        appendInlineContent(DOT_SLOT, "·")
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("code") }
    }
    val dot = mapOf(
        DOT_SLOT to InlineTextContent(
            Placeholder(
                // Diameter plus the optical side bearing the mark needs on each side.
                width = 0.34.em,
                height = 0.2.em,
                placeholderVerticalAlign = PlaceholderVerticalAlign.AboveBaseline,
            ),
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val radius = size.height / 2f
                drawCircle(
                    color = dotColor,
                    radius = radius,
                    center = Offset(size.width / 2f, size.height - radius),
                )
            }
        },
    )
    Text(
        text = mark,
        inlineContent = dot,
        style = style,
        color = color,
        textAlign = TextAlign.Center,
        modifier = modifier.clearAndSetSemantics {
            contentDescription = WORDMARK_LABEL
            if (isHeading) heading()
        },
    )
}
