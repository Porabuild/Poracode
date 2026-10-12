package com.poracode.app.ui.settingsintegrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceSort
import com.poracode.app.protocol.settingsintegrations.MarketplaceSkill
import com.poracode.app.protocol.settingsintegrations.SkillEntry
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillImportMode
import com.poracode.app.protocol.settingsintegrations.SkillMarketplace
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScope
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsSlot
import com.poracode.app.session.settingsintegrations.SettingsIntegrationsState

@Composable
internal fun SkillsSettingsPane(
    state: SettingsIntegrationsState,
    access: SettingsIntegrationsAccess,
    globalOwner: SkillOwner,
    projectOwner: SkillOwner?,
    callbacks: SettingsIntegrationsCallbacks,
    modifier: Modifier = Modifier,
) {
    var owner by remember(projectOwner) { mutableStateOf(projectOwner ?: globalOwner) }
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(MarketplaceSort.Rank) }
    var pendingDelete by remember { mutableStateOf<SkillEntry?>(null) }
    val skills = state.skills?.skills.orEmpty()
    LazyColumn(
        modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = owner.isGlobal,
                    onClick = { owner = globalOwner; callbacks.onRefreshSkills(globalOwner) },
                    label = { Text(stringResource(R.string.settings_integrations_global)) },
                )
                if (projectOwner != null) FilterChip(
                    selected = !owner.isGlobal,
                    onClick = { owner = projectOwner; callbacks.onRefreshSkills(projectOwner) },
                    label = { Text(stringResource(R.string.settings_integrations_project)) },
                )
                OutlinedButton(
                    enabled = access.canRead && access.online,
                    onClick = { callbacks.onRefreshSkills(owner) },
                ) { Text(stringResource(R.string.settings_integrations_refresh)) }
            }
        }
        if (SettingsIntegrationsSlot.Skills in state.loading) {
            item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
        item { SectionTitle(stringResource(R.string.settings_integrations_installed_skills)) }
        if (skills.isEmpty()) {
            item { EmptyCard(stringResource(R.string.settings_integrations_no_skills)) }
        }
        items(skills, key = { it.absolutePath }) { skill ->
            SkillCard(
                skill = skill,
                canOperate = access.canOperate && access.online,
                onEnabled = { callbacks.onSetSkillEnabled(owner, skill, it) },
                onDelete = { pendingDelete = skill },
                onImport = skill.sourcePath?.let { source ->
                    {
                        callbacks.onImportSkill(
                            SkillImportItem(
                                sourcePath = source,
                                mode = SkillImportMode.Copy,
                                destinationScope = if (owner.isGlobal) SkillScope.Global else SkillScope.Project,
                                destinationOwner = owner,
                            ),
                        )
                    }
                },
            )
        }
        item { SectionTitle(stringResource(R.string.settings_integrations_marketplace)) }
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it.take(200) },
                label = { Text(stringResource(R.string.settings_integrations_search_skills)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MarketplaceSort.entries.forEach { option ->
                    FilterChip(
                        selected = sort == option,
                        onClick = { sort = option },
                        label = { Text(sortLabel(option)) },
                    )
                }
            }
        }
        item {
            Button(
                enabled = access.canRead && access.online,
                onClick = {
                    callbacks.onMarketplaceSearch(
                        MarketplaceRequest(SkillMarketplace.SkillsSh, query, sort),
                    )
                },
            ) { Text(stringResource(R.string.settings_integrations_search)) }
        }
        if (SettingsIntegrationsSlot.Marketplace in state.loading) {
            item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
        items(state.marketplace?.skills.orEmpty(), key = { it.id }) { skill ->
            MarketplaceCard(skill, access.canOperate && access.online) {
                callbacks.onInstallSkill(
                    MarketplaceInstallRequest(
                        owner = owner,
                        marketplace = skill.marketplace,
                        marketplaceSkillId = skill.id,
                        destinationScope = if (owner.isGlobal) SkillScope.Global else SkillScope.Project,
                    ),
                )
            }
        }
    }
    pendingDelete?.let { skill ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.settings_integrations_delete_title)) },
            text = { Text(stringResource(R.string.settings_integrations_delete_message, skill.name)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    callbacks.onDeleteSkill(owner, skill)
                }) { Text(stringResource(R.string.settings_integrations_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.settings_integrations_cancel))
                }
            },
        )
    }
}

@Composable
private fun SkillCard(
    skill: SkillEntry,
    canOperate: Boolean,
    onEnabled: (Boolean) -> Unit,
    onDelete: () -> Unit,
    onImport: (() -> Unit)?,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(skill.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (skill.scope == SkillScope.Project) stringResource(R.string.settings_integrations_project)
                        else stringResource(R.string.settings_integrations_global),
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
                Switch(
                    checked = skill.enabled,
                    enabled = canOperate && skill.mutable && skill.valid,
                    onCheckedChange = onEnabled,
                )
                if (skill.mutable) IconButton(enabled = canOperate, onClick = onDelete) {
                    Icon(Icons.Outlined.Delete, stringResource(R.string.settings_integrations_delete))
                }
            }
            if (skill.description.isNotEmpty()) Text(skill.description)
            if (!skill.valid) Text(
                stringResource(R.string.settings_integrations_invalid_skill),
                color = MaterialTheme.colorScheme.error,
            )
            if (onImport != null && skill.importState == "available") OutlinedButton(
                enabled = canOperate,
                onClick = onImport,
            ) { Text(stringResource(R.string.settings_integrations_import)) }
        }
    }
}

@Composable
private fun MarketplaceCard(skill: MarketplaceSkill, enabled: Boolean, onInstall: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(skill.name, style = MaterialTheme.typography.titleMedium)
            skill.description?.let { Text(it) }
            val grade = skill.securityGrade
            if (grade != null) Text(stringResource(R.string.settings_integrations_security_grade, grade))
            Button(enabled = enabled, onClick = onInstall) {
                Text(stringResource(R.string.settings_integrations_install))
            }
        }
    }
}

@Composable
internal fun SectionTitle(value: String) = Text(
    value,
    style = MaterialTheme.typography.titleLarge,
    modifier = Modifier.padding(top = 12.dp).semantics { heading() },
)

@Composable
internal fun EmptyCard(value: String) = Card(Modifier.fillMaxWidth()) {
    Text(value, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun sortLabel(sort: MarketplaceSort) = stringResource(when (sort) {
    MarketplaceSort.Rank -> R.string.settings_integrations_sort_rank
    MarketplaceSort.Stars -> R.string.settings_integrations_sort_stars
    MarketplaceSort.Recent -> R.string.settings_integrations_sort_recent
    MarketplaceSort.Votes -> R.string.settings_integrations_sort_votes
})
