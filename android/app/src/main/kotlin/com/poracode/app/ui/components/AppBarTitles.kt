package com.poracode.app.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextOverflow

/**
 * Smaller single-line app-bar title: long labels stay on one line with
 * ellipsis as the fallback instead of wrapping into a second line.
 * Navigation and action touch targets are unchanged — only the title text
 * styling differs.
 */
@Composable
fun CompactAppBarTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}
