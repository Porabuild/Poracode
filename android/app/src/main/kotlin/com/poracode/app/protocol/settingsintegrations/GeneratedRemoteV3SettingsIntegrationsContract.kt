package com.poracode.app.protocol.settingsintegrations

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.app.protocol.GeneratedRemoteV3ProjectContract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EBeginMcpServerOauthU2ERequest
import com.poracode.remote.v3.generated.procedureU2EBeginMcpServerOauthU2EResult
import com.poracode.remote.v3.generated.procedureU2EClearMcpServerOauthU2ERequest
import com.poracode.remote.v3.generated.procedureU2EDeleteSkillU2ERequest
import com.poracode.remote.v3.generated.procedureU2EDiscoverExternalMcpServersU2ERequest
import com.poracode.remote.v3.generated.procedureU2EDiscoverExternalMcpServersU2EResult
import com.poracode.remote.v3.generated.procedureU2EGetMcpOauthStatusU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGetMcpOauthStatusU2EResult
import com.poracode.remote.v3.generated.procedureU2EImportSkillsU2ERequest
import com.poracode.remote.v3.generated.procedureU2EImportSkillsU2EResult
import com.poracode.remote.v3.generated.procedureU2EInstallMarketplaceSkillU2ERequest
import com.poracode.remote.v3.generated.procedureU2EInstallMarketplaceSkillU2EResult
import com.poracode.remote.v3.generated.procedureU2EListSkillMarketplaceU2ERequest
import com.poracode.remote.v3.generated.procedureU2EListSkillMarketplaceU2EResult
import com.poracode.remote.v3.generated.procedureU2EProbeMcpServerU2ERequest
import com.poracode.remote.v3.generated.procedureU2EProbeMcpServerU2EResult
import com.poracode.remote.v3.generated.procedureU2EScanSkillsU2ERequest
import com.poracode.remote.v3.generated.procedureU2EScanSkillsU2EResult
import com.poracode.remote.v3.generated.procedureU2ESetSkillEnabledU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWaitMcpServerOauthU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWaitMcpServerOauthU2EResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

enum class SettingsIntegrationProcedure(
    val wireName: String,
    val scope: String,
    val ownerKind: String,
    val mutation: Boolean,
    val longRunning: Boolean = false,
) {
    ScanSkills("scanSkills", "session:read", "optionalProjectLocation", false),
    ListSkillMarketplace("listSkillMarketplace", "session:read", "none", false),
    SetSkillEnabled("setSkillEnabled", "session:operate", "optionalProjectLocation", true),
    DeleteSkill("deleteSkill", "session:operate", "optionalProjectLocation", true),
    ImportSkills("importSkills", "session:operate", "skillLocations", true),
    InstallMarketplaceSkill("installMarketplaceSkill", "session:operate", "optionalProjectLocation", true),
    DiscoverExternalMcpServers("discoverExternalMcpServers", "session:read", "optionalProjectLocation", false),
    ProbeMcpServer("probeMcpServer", "session:operate", "optionalProjectLocation", true),
    GetMcpOauthStatus("getMcpOauthStatus", "session:read", "optionalProjectLocation", false),
    BeginMcpServerOauth("beginMcpServerOauth", "session:operate", "optionalProjectLocation", true),
    WaitMcpServerOauth("waitMcpServerOauth", "session:operate", "optionalProjectLocation", true, true),
    ClearMcpServerOauth("clearMcpServerOauth", "session:operate", "optionalProjectLocation", true),
}

/** The sole generated-symbol adapter for this slice. */
object GeneratedRemoteV3SettingsIntegrationsContract {
    private val generated = RemoteContractMetadata.procedures.associateBy { it.name }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        SettingsIntegrationProcedure.entries.forEach { procedure ->
            val descriptor = checkNotNull(generated[procedure.wireName])
            check(descriptor.scope == procedure.scope)
            check(descriptor.owner == procedure.ownerKind)
            check((descriptor.resultKind == "omitted") == (procedure.resultCodec() == null))
        }
    }

    fun request(procedure: SettingsIntegrationProcedure, payload: JsonObject): String =
        GeneratedRemoteV3ProjectContract.procedureRequest(
            procedure.wireName,
            payload,
            procedure.requestCodec(),
        )

    fun result(procedure: SettingsIntegrationProcedure, envelope: String): JsonObject {
        val codec = requireNotNull(procedure.resultCodec())
        return try {
            Json.parseToJsonElement(
                GeneratedRemoteV3ProjectContract.procedureResult(envelope, codec),
            ) as JsonObject
        } catch (error: RemoteClientException) {
            throw error
        } catch (_: Exception) {
            throw RemoteClientException.invalidResponse(
                "Remote settings integrations result validation failed.",
            )
        }
    }

    /** Omitted procedure roots intentionally have no generated result codec and must omit result. */
    fun omittedResult(procedure: SettingsIntegrationProcedure, envelope: String) {
        check(procedure.resultCodec() == null)
        val value = try { Json.parseToJsonElement(envelope) as? JsonObject } catch (_: Exception) { null }
        if (value == null || value.containsKey("result")) {
            throw RemoteClientException.invalidResponse(
                "Remote settings integrations omitted result validation failed.",
            )
        }
    }
}

private fun SettingsIntegrationProcedure.requestCodec(): RemoteRootCodec<*> = when (this) {
    SettingsIntegrationProcedure.ScanSkills -> RemoteRootCodecs.procedureU2EScanSkillsU2ERequest
    SettingsIntegrationProcedure.ListSkillMarketplace -> RemoteRootCodecs.procedureU2EListSkillMarketplaceU2ERequest
    SettingsIntegrationProcedure.SetSkillEnabled -> RemoteRootCodecs.procedureU2ESetSkillEnabledU2ERequest
    SettingsIntegrationProcedure.DeleteSkill -> RemoteRootCodecs.procedureU2EDeleteSkillU2ERequest
    SettingsIntegrationProcedure.ImportSkills -> RemoteRootCodecs.procedureU2EImportSkillsU2ERequest
    SettingsIntegrationProcedure.InstallMarketplaceSkill -> RemoteRootCodecs.procedureU2EInstallMarketplaceSkillU2ERequest
    SettingsIntegrationProcedure.DiscoverExternalMcpServers -> RemoteRootCodecs.procedureU2EDiscoverExternalMcpServersU2ERequest
    SettingsIntegrationProcedure.ProbeMcpServer -> RemoteRootCodecs.procedureU2EProbeMcpServerU2ERequest
    SettingsIntegrationProcedure.GetMcpOauthStatus -> RemoteRootCodecs.procedureU2EGetMcpOauthStatusU2ERequest
    SettingsIntegrationProcedure.BeginMcpServerOauth -> RemoteRootCodecs.procedureU2EBeginMcpServerOauthU2ERequest
    SettingsIntegrationProcedure.WaitMcpServerOauth -> RemoteRootCodecs.procedureU2EWaitMcpServerOauthU2ERequest
    SettingsIntegrationProcedure.ClearMcpServerOauth -> RemoteRootCodecs.procedureU2EClearMcpServerOauthU2ERequest
}

private fun SettingsIntegrationProcedure.resultCodec(): RemoteRootCodec<*>? = when (this) {
    SettingsIntegrationProcedure.ScanSkills -> RemoteRootCodecs.procedureU2EScanSkillsU2EResult
    SettingsIntegrationProcedure.ListSkillMarketplace -> RemoteRootCodecs.procedureU2EListSkillMarketplaceU2EResult
    SettingsIntegrationProcedure.ImportSkills -> RemoteRootCodecs.procedureU2EImportSkillsU2EResult
    SettingsIntegrationProcedure.InstallMarketplaceSkill -> RemoteRootCodecs.procedureU2EInstallMarketplaceSkillU2EResult
    SettingsIntegrationProcedure.DiscoverExternalMcpServers -> RemoteRootCodecs.procedureU2EDiscoverExternalMcpServersU2EResult
    SettingsIntegrationProcedure.ProbeMcpServer -> RemoteRootCodecs.procedureU2EProbeMcpServerU2EResult
    SettingsIntegrationProcedure.GetMcpOauthStatus -> RemoteRootCodecs.procedureU2EGetMcpOauthStatusU2EResult
    SettingsIntegrationProcedure.BeginMcpServerOauth -> RemoteRootCodecs.procedureU2EBeginMcpServerOauthU2EResult
    SettingsIntegrationProcedure.WaitMcpServerOauth -> RemoteRootCodecs.procedureU2EWaitMcpServerOauthU2EResult
    SettingsIntegrationProcedure.SetSkillEnabled,
    SettingsIntegrationProcedure.DeleteSkill,
    SettingsIntegrationProcedure.ClearMcpServerOauth,
    -> null
}
