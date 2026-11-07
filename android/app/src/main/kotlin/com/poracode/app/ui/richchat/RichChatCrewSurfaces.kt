package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EditOff
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.poracode.app.R

@Composable
internal fun RichChatCrewChip(
    crew: ReadOnlyCrew,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val name = crew.name.ifBlank { stringResource(R.string.rich_chat_crew) }
    val description = "$name, ${stringResource(R.string.rich_chat_crew_helpers_count, crew.helperCount)}"
    AssistChip(
        onClick = onClick,
        enabled = enabled,
        label = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("+${crew.helperCount}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        leadingIcon = { Icon(Icons.Outlined.Groups, contentDescription = null) },
        modifier = Modifier.semantics { contentDescription = description },
    )
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun ReadOnlyCrewRosterSheet(
    crew: ReadOnlyCrew,
    leadAgentKind: String,
    leadModel: String,
    leadEffort: String?,
    leadFast: Boolean,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(crew.name.ifBlank { stringResource(R.string.rich_chat_crew) }, style = MaterialTheme.typography.titleLarge)
            ReadOnlyCrewMember(
                label = stringResource(R.string.rich_chat_crew_lead),
                agentKind = leadAgentKind,
                model = leadModel,
                effort = leadEffort,
                fast = leadFast,
                noEdits = false,
            )
            HorizontalDivider()
            crew.roles.forEach { role ->
                ReadOnlyCrewMember(
                    label = role.label,
                    agentKind = role.agentKind,
                    model = role.model,
                    effort = role.effort,
                    fast = role.fast,
                    noEdits = role.noEdits,
                )
            }
            Text(
                stringResource(
                    if (crew.crewOnly) R.string.rich_chat_crew_policy_only
                    else R.string.rich_chat_crew_policy_first,
                ),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp),
            )
        }
    }
}

@Composable
private fun ReadOnlyCrewMember(
    label: String,
    agentKind: String,
    model: String,
    effort: String?,
    fast: Boolean,
    noEdits: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            if (fast) Text(stringResource(R.string.rich_chat_fast_mode), style = MaterialTheme.typography.labelSmall)
            if (noEdits) {
                Icon(
                    Icons.Outlined.EditOff,
                    contentDescription = stringResource(R.string.rich_chat_crew_no_edits),
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            listOfNotNull(agentKind, model, effort).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
