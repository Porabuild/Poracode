package com.poracode.app.ui.richchat

import android.content.ClipData
import android.content.ClipboardManager
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Web
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.poracode.app.R
import com.poracode.app.chat.RichHtmlVisualPresentation
import com.poracode.app.chat.RichInlineVisualBlock
import com.poracode.app.chat.RichInlineVisualParser
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/**
 * Settled assistant text split around `poracode-html` previews; native-visual
 * fences keep their source, as in the rest of the mobile transcript.
 */
@Composable
internal fun RichAssistantMarkdown(source: String, settled: Boolean) {
    val blocks = remember(source, settled) { RichInlineVisualParser.blocks(source, settled) }
    if (blocks == null) {
        RichMarkdownView(source)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            when (block) {
                is RichInlineVisualBlock.Markdown -> RichMarkdownView(block.text)
                is RichInlineVisualBlock.Html -> RichHtmlVisualView(block.visual)
                is RichInlineVisualBlock.Source -> MarkdownCodeBlock(RichMarkdownBlock.Code(block.language, block.source))
            }
        }
    }
}

/** App theme values exposed to authored pages, mirroring the desktop variable set. */
internal fun htmlVisualTheme(colors: ColorScheme, dark: Boolean): JsonObject {
    fun hex(color: Color) = "#%06x".format(color.toArgb() and 0xFFFFFF)
    return buildJsonObject {
        put("appearance", if (dark) "dark" else "light")
        put("variables", buildJsonObject {
            put("--background", hex(colors.surfaceContainerLow))
            put("--foreground", hex(colors.onSurface))
            put("--surface", hex(colors.surfaceContainerHigh))
            put("--surface-secondary", hex(colors.surfaceContainerHighest))
            put("--muted", hex(colors.onSurfaceVariant))
            put("--border", hex(colors.outlineVariant))
            put("--accent", hex(colors.primary))
            put("--accent-foreground", hex(colors.onPrimary))
            put("--success", if (dark) "#3fb950" else "#1a7f37")
            put("--warning", if (dark) "#d29922" else "#9a6700")
            put("--danger", hex(colors.error))
            put("--font-sans", "Roboto, system-ui, sans-serif")
            put("--font-mono", "\"Roboto Mono\", monospace")
        })
    }
}

@Composable
internal fun RichHtmlVisualView(visual: RichHtmlVisualPresentation) {
    val colors = MaterialTheme.colorScheme
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val theme = remember(colors) { htmlVisualTheme(colors, colors.background.luminance() < 0.5f) }
    var height by remember(visual) { mutableFloatStateOf(RichInlineVisualParser.MIN_HEIGHT.toFloat()) }
    var ready by remember(visual) { mutableStateOf(false) }
    var unavailable by remember(visual) { mutableStateOf(false) }
    var showSource by remember(visual) { mutableStateOf(false) }
    var pendingLink by remember { mutableStateOf<String?>(null) }
    val title = visual.title.ifEmpty { stringResource(R.string.rich_chat_html_visual_title) }
    val status = when (visual.sourceOnlyReason) {
        RichHtmlVisualPresentation.SourceOnlyReason.INCOMPLETE -> stringResource(R.string.rich_chat_html_visual_incomplete)
        RichHtmlVisualPresentation.SourceOnlyReason.UNSUPPORTED -> stringResource(R.string.rich_chat_html_visual_unsupported)
        RichHtmlVisualPresentation.SourceOnlyReason.LIMITED -> stringResource(R.string.rich_chat_html_visual_limited)
        RichHtmlVisualPresentation.SourceOnlyReason.TOO_LARGE -> stringResource(R.string.rich_chat_html_visual_too_large)
        null -> if (unavailable) stringResource(R.string.rich_chat_html_visual_unavailable) else null
    }
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surfaceContainerLow)
            .border(0.5.dp, colors.outlineVariant, shape),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Web, contentDescription = null, modifier = Modifier.size(16.dp), tint = colors.onSurfaceVariant)
            Text(
                title,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            if (status == null) {
                TextButton(onClick = {
                    showSource = !showSource
                    ready = false
                }) {
                    Text(stringResource(if (showSource) R.string.rich_chat_html_visual_preview else R.string.rich_chat_html_visual_source))
                }
            }
            IconButton(onClick = {
                context.getSystemService(ClipboardManager::class.java)
                    ?.setPrimaryClip(ClipData.newPlainText(title, visual.html))
            }) {
                Icon(Icons.Outlined.ContentCopy, contentDescription = stringResource(R.string.rich_chat_html_visual_copy_source))
            }
        }
        HorizontalDivider(color = colors.outlineVariant)
        when {
            status != null -> {
                StatusText(status)
                HorizontalDivider(color = colors.outlineVariant)
                HtmlSource(visual.html)
            }
            showSource -> HtmlSource(visual.html)
            else -> {
                if (!ready) StatusText(stringResource(R.string.rich_chat_html_visual_loading))
                HtmlVisualWebView(
                    html = visual.html,
                    theme = theme,
                    modifier = Modifier.fillMaxWidth().height(height.dp).alpha(if (ready) 1f else 0f),
                    onReady = { ready = true },
                    onHeight = { height = it },
                    onUnavailable = { unavailable = true },
                    onOpenLink = { if (pendingLink == null) pendingLink = it },
                )
            }
        }
    }
    pendingLink?.let { url ->
        AlertDialog(
            onDismissRequest = { pendingLink = null },
            title = { Text(stringResource(R.string.rich_chat_html_visual_open_link_title)) },
            text = { Text(url) },
            confirmButton = {
                TextButton(onClick = {
                    pendingLink = null
                    runCatching { uriHandler.openUri(url) }
                }) { Text(stringResource(R.string.rich_chat_html_visual_open_link)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingLink = null }) { Text(stringResource(R.string.rich_chat_cancel)) }
            },
        )
    }
}

@Composable
private fun StatusText(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun HtmlSource(html: String) {
    Box(Modifier.padding(8.dp)) { MarkdownCodeBlock(RichMarkdownBlock.Code("html", html)) }
}

@Composable
private fun HtmlVisualWebView(
    html: String,
    theme: JsonObject,
    modifier: Modifier,
    onReady: () -> Unit,
    onHeight: (Float) -> Unit,
    onUnavailable: () -> Unit,
    onOpenLink: (String) -> Unit,
) {
    val currentTheme by rememberUpdatedState(theme)
    val currentOnReady by rememberUpdatedState(onReady)
    val currentOnHeight by rememberUpdatedState(onHeight)
    val currentOnUnavailable by rememberUpdatedState(onUnavailable)
    val currentOnOpenLink by rememberUpdatedState(onOpenLink)
    key(html) {
        var port by remember { mutableStateOf<WebMessagePort?>(null) }
        LaunchedEffect(theme) {
            port?.postMessage(WebMessage(buildJsonObject { put("operation", "theme"); put("theme", theme) }.toString()))
        }
        AndroidView(
            modifier = modifier,
            factory = { androidContext ->
                createSandboxWebView(androidContext) { view ->
                    port = connectSandboxPort(view) { port, data ->
                        when ((data["operation"] as? JsonPrimitive)?.content) {
                            "boot" -> port.postMessage(WebMessage(buildJsonObject {
                                put("operation", "startHtml")
                                put("configuration", buildJsonObject {
                                    put("html", html)
                                    put("theme", currentTheme)
                                })
                            }.toString()))
                            "ready" -> currentOnReady()
                            "height" -> (data["height"] as? JsonPrimitive)?.doubleOrNull?.takeIf { it.isFinite() }
                                ?.let { currentOnHeight(it.coerceIn(RichInlineVisualParser.MIN_HEIGHT, RichInlineVisualParser.MAX_HEIGHT).toFloat()) }
                            "unavailable" -> currentOnUnavailable()
                            "openLink" -> RichInlineVisualParser.linkUrl((data["url"] as? JsonPrimitive)?.contentOrNull)
                                ?.let { currentOnOpenLink(it) }
                        }
                    }
                }
            },
            onRelease = { view ->
                runCatching { port?.postMessage(WebMessage("{\"operation\":\"close\"}")) }
                port?.close(); port = null
                view.stopLoading(); view.destroy()
            },
        )
    }
}
