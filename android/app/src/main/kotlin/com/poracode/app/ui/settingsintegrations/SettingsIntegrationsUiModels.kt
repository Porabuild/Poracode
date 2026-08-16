package com.poracode.app.ui.settingsintegrations

import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.MarketplaceRequest
import com.poracode.app.protocol.settingsintegrations.McpDiscoveryRequest
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.SkillEntry
import com.poracode.app.protocol.settingsintegrations.SkillImportItem
import com.poracode.app.protocol.settingsintegrations.SkillOwner

data class SettingsIntegrationsAccess(
    val hostSelected: Boolean,
    val protocolCompatible: Boolean,
    val ready: Boolean,
    val online: Boolean,
    val canRead: Boolean,
    val canOperate: Boolean,
)

data class SettingsIntegrationsCallbacks(
    val onRefreshSkills: (SkillOwner) -> Unit,
    val onSetSkillEnabled: (SkillOwner, SkillEntry, Boolean) -> Unit,
    val onDeleteSkill: (SkillOwner, SkillEntry) -> Unit,
    val onImportSkill: (SkillImportItem) -> Unit,
    val onMarketplaceSearch: (MarketplaceRequest) -> Unit,
    val onInstallSkill: (MarketplaceInstallRequest) -> Unit,
    val onDiscoverMcp: (McpDiscoveryRequest) -> Unit,
    val onProbeMcp: (SkillOwner, McpServer) -> Unit,
    val onBeginOauth: (SkillOwner, McpServer) -> Unit,
    val onLaunchOauth: (SkillOwner) -> String?,
    val onClearOauth: (SkillOwner, String) -> Unit,
    val onRefreshOauth: (SkillOwner) -> Unit,
)
