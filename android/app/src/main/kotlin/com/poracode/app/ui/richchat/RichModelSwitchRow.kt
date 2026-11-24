package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Model id → display label from the thread provider's GUI model catalog. */
internal val LocalRichChatModelLabels = compositionLocalOf<Map<String, String>> { emptyMap() }

internal fun richChatModelLabels(agentStatus: AgentStatusEntry?): Map<String, String> {
    val capabilities = agentStatus?.capabilities ?: return emptyMap()
    val labels = linkedMapOf<String, String>()
    val catalogs = listOfNotNull(
        capabilities["models"] as? JsonArray,
        ((capabilities["presentationCapabilities"] as? JsonObject)?.get("gui") as? JsonObject)
            ?.get("models") as? JsonArray,
    )
    for (catalog in catalogs) {
        for (entry in catalog) {
            val item = entry as? JsonObject ?: continue
            val id = (item["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
            val label = (item["label"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
            labels.putIfAbsent(id, label)
        }
    }
    return labels
}

private fun JsonObject.stringValue(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

/** Quiet divider line where the thread's answering model changed. */
@Composable
internal fun RichModelSwitchRow(item: RichRuntimeItem) {
    val payload = item.payload as? JsonObject ?: return
    val from = payload.stringValue("fromModel")?.takeIf { it.isNotEmpty() } ?: return
    val to = payload.stringValue("toModel")?.takeIf { it.isNotEmpty() } ?: return
    val labels = LocalRichChatModelLabels.current
    val colors = PoracodeTheme.colors
    val text = stringResource(R.string.rich_chat_model_switched, labels[from] ?: from, labels[to] ?: to)
    Row(
        Modifier
            .fillMaxWidth()
            .testTag("native-e2e.transcript.model-switch")
            .semantics { contentDescription = text }
            .padding(horizontal = 12.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(PoracodeIcons.SwapHoriz, contentDescription = null, modifier = Modifier.size(12.dp), tint = colors.muted)
        Text(
            text,
            style = PoracodeTextStyles.rowDescription.copy(fontStyle = FontStyle.Italic),
            color = colors.muted,
        )
    }
}

