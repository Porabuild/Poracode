package com.poracode.app.session.settingsintegrations

import com.poracode.app.protocol.settingsintegrations.ExternalMcpGroup
import com.poracode.app.protocol.settingsintegrations.MarketplaceResult
import com.poracode.app.protocol.settingsintegrations.McpOauthStatus
import com.poracode.app.protocol.settingsintegrations.McpProbeResult
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScanResult

enum class SettingsIntegrationsSlot { Skills, Marketplace, Discovery, Probe, Oauth }

enum class SettingsIntegrationsAction {
    EnableSkill, DeleteSkill, ImportSkills, InstallSkill, ProbeServer,
    BeginOauth, WaitOauth, ClearOauth,
}

data class SettingsIntegrationsMutation(
    val action: SettingsIntegrationsAction,
    val applied: Boolean,
    val uncertain: Boolean = false,
    val reconciled: Boolean = false,
)

sealed interface OauthLifecycle {
    data object Idle : OauthLifecycle
    data object Beginning : OauthLifecycle
    class LaunchRequired internal constructor(
        internal val flowId: String,
        internal val authorizationUrl: String,
    ) : OauthLifecycle {
        override fun toString() = "LaunchRequired(flowId=[redacted], authorizationUrl=[redacted])"
    }
    data object Waiting : OauthLifecycle
    data object Authorized : OauthLifecycle
    data object Failed : OauthLifecycle
    data object TimedOut : OauthLifecycle
    data object Cancelled : OauthLifecycle
    data object PausedInBackground : OauthLifecycle
}

data class SettingsIntegrationsState(
    val owner: SettingsIntegrationsSessionKey? = null,
    val selectedSkillOwner: SkillOwner = SkillOwner.Global,
    val skills: SkillScanResult? = null,
    val marketplace: MarketplaceResult? = null,
    val discovery: List<ExternalMcpGroup> = emptyList(),
    val probes: Map<String, McpProbeResult> = emptyMap(),
    val oauthStatus: McpOauthStatus? = null,
    val oauthLifecycle: OauthLifecycle = OauthLifecycle.Idle,
    val loading: Set<SettingsIntegrationsSlot> = emptySet(),
    val failures: Map<SettingsIntegrationsSlot, SettingsIntegrationsFailure> = emptyMap(),
    val mutation: SettingsIntegrationsMutation? = null,
)
