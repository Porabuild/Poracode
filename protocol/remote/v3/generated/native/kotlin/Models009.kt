// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedurerenameProjectEntryRequest_4a22ffc9b4(
    @SerialName("nextName") val nextName: String,
    @SerialName("path") val path: String,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("nextName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

typealias ProcedurereorderQueuedThreadFollowUpRequestU2DBeforeId_df704162f3 = String?

@Serializable
data class ProcedurereorderQueuedThreadFollowUpRequest_59599d21a2(
    @SerialName("beforeId") val beforeId: RemoteField<String>,
    @SerialName("id") val id: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("beforeId", "String", true, true, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurerollbackThreadConversationRequest_b50a220194(
    @SerialName("config") val config: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089> = RemoteField.Missing,
    @SerialName("numTurns") val numTurns: Long,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("config", "ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("numTurns", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6 {
    @SerialName("terminal") TERMINAL,
    @SerialName("gui") GUI,
}

@Serializable
data class ProcedurescanSkillsRequest_eb5b966723(
    @SerialName("agentKind") val agentKind: RemoteField<String> = RemoteField.Missing,
    @SerialName("presentationMode") val presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("agentKind", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("presentationMode", "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6 {
    @SerialName("slash") SLASH,
    @SerialName("dollar") DOLLAR,
    @SerialName("prompt") PROMPT,
    @SerialName("skill") SKILL,
}

typealias ProcedurescanSkillsResultU2DInvocation_7a20e2f82d = ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6?

@Serializable
data class ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee(
    @SerialName("message") val message: String,
    @SerialName("path") val path: String,
    @SerialName("providerId") val providerId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("message", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7 {
    @SerialName("available") AVAILABLE,
    @SerialName("already-imported") ALREADYU2DIMPORTED,
    @SerialName("conflict") CONFLICT,
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61 {
    @SerialName("read-error") READU2DERROR,
    @SerialName("missing-file") MISSINGU2DFILE,
    @SerialName("too-large") TOOU2DLARGE,
    @SerialName("missing-frontmatter") MISSINGU2DFRONTMATTER,
    @SerialName("missing-name") MISSINGU2DNAME,
    @SerialName("invalid-name") INVALIDU2DNAME,
    @SerialName("name-mismatch") NAMEU2DMISMATCH,
    @SerialName("missing-description") MISSINGU2DDESCRIPTION,
    @SerialName("description-too-long") DESCRIPTIONU2DTOOU2DLONG,
}

@Serializable
enum class ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df {
    @SerialName("managed") MANAGED,
    @SerialName("external") EXTERNAL,
    @SerialName("built-in") BUILTU2DIN,
    @SerialName("plugin") PLUGIN,
}

@Serializable
data class ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("availability") val availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = RemoteField.Missing,
    @SerialName("description") val description: String,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("folderName") val folderName: String,
    @SerialName("id") val id: String,
    @SerialName("importState") val importState: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7> = RemoteField.Missing,
    @SerialName("invalidReason") val invalidReason: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61> = RemoteField.Missing,
    @SerialName("linked") val linked: Boolean,
    @SerialName("mutable") val mutable: Boolean,
    @SerialName("name") val name: String,
    @SerialName("origin") val origin: ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df,
    @SerialName("pluginId") val pluginId: RemoteField<String> = RemoteField.Missing,
    @SerialName("pluginName") val pluginName: RemoteField<String> = RemoteField.Missing,
    @SerialName("portable") val portable: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("providerGroupId") val providerGroupId: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerGroupLabel") val providerGroupLabel: RemoteField<String> = RemoteField.Missing,
    @SerialName("providerGroupOrder") val providerGroupOrder: RemoteField<Long> = RemoteField.Missing,
    @SerialName("providerId") val providerId: String,
    @SerialName("providerLabel") val providerLabel: String,
    @SerialName("rootPath") val rootPath: String,
    @SerialName("scope") val scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11,
    @SerialName("scopeLabel") val scopeLabel: String,
    @SerialName("skillFilePath") val skillFilePath: String,
    @SerialName("sourcePath") val sourcePath: RemoteField<String> = RemoteField.Missing,
    @SerialName("valid") val valid: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("availability", "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("folderName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("importState", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invalidReason", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("linked", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("mutable", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("name", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("origin", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("pluginName", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("portable", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupId", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupLabel", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerGroupOrder", "Long", false, false, -9007199254740991.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("providerLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rootPath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scope", "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopeLabel", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skillFilePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sourcePath", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("valid", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurescanSkillsResult_a6d4c4f03b(
    @SerialName("canLinkToGlobal") val canLinkToGlobal: Boolean,
    @SerialName("effectiveSkillIds") val effectiveSkillIds: List<String>,
    @SerialName("invocation") val invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6>,
    @SerialName("issues") val issues: List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>,
    @SerialName("skills") val skills: List<ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("canLinkToGlobal", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effectiveSkillIds", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invocation", "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("issues", "List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a(
    @SerialName("excludePatterns") val excludePatterns: List<String>,
    @SerialName("useIgnoreFiles") val useIgnoreFiles: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("excludePatterns", "List<String>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("useIgnoreFiles", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesRequest_c4ad1400e2(
    @SerialName("limit") val limit: RemoteField<Long> = RemoteField.Missing,
    @SerialName("projectLocation") val projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154,
    @SerialName("query") val query: RemoteField<String> = RemoteField.Missing,
    @SerialName("searchConfig") val searchConfig: RemoteField<ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("limit", "Long", false, false, 1.0, 200.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("query", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("searchConfig", "ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b(
    @SerialName("name") val name: String,
    @SerialName("path") val path: String,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesResult_2465ffaaf2(
    @SerialName("entries") val entries: List<ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b>,
    @SerialName("totalIndexed") val totalIndexed: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("totalIndexed", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectTreeResult_ed3d977334(
    @SerialName("entries") val entries: List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("entries", "List<ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresetSkillEnabledRequest_38462ff398(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("projectLocation") val projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = RemoteField.Missing,
    @SerialName("wslDistro") val wslDistro: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("absolutePath", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("projectLocation", "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("wslDistro", "String", false, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedurestageThreadInputRequest_d4db039cba(
    @SerialName("prompt") val prompt: String,
    @SerialName("segments") val segments: RemoteField<List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>> = RemoteField.Missing,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("prompt", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("segments", "List<ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeRequest_ff495aee3e(
    @SerialName("parentItemId") val parentItemId: String,
    @SerialName("threadId") val threadId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("parentItemId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e {
    @SerialName("usage.spent") USAGEU2ESPENT,
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349 {
    @SerialName("cumulative") CUMULATIVE,
    @SerialName("per-call") PERU2DCALL,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01(
    @SerialName("counter") val counter: Long,
    @SerialName("counterKind") val counterKind: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349,
    @SerialName("epoch") val epoch: Long,
    @SerialName("fresh") val fresh: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("model") val model: RemoteField<String> = RemoteField.Missing,
    @SerialName("occurredAt") val occurredAt: RemoteField<Long> = RemoteField.Missing,
    @SerialName("sampleId") val sampleId: String,
    @SerialName("scopeId") val scopeId: String,
    @SerialName("turnId") val turnId: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("counter", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("counterKind", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("epoch", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("fresh", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("model", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("occurredAt", "Long", false, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("sampleId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("scopeId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("turnId", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93(
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e,
    @SerialName("usage") val usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("usage", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa {
    @SerialName("command") COMMAND,
    @SerialName("other") OTHER,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c(
    @SerialName("description") val description: String,
    @SerialName("kind") val kind: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa,
    @SerialName("taskId") val taskId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("kind", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("taskId", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100 {
    @SerialName("background_tasks.changed") BACKGROUNDU5FTASKSU2ECHANGED,
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_0bffd4a90c(
    @SerialName("tasks") val tasks: List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c>,
    @SerialName("threadId") val threadId: String,
    @SerialName("type") val type: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("tasks", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("threadId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("type", "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b(
    @SerialName("description") val description: RemoteField<String> = RemoteField.Missing,
    @SerialName("label") val label: String,
    @SerialName("optionId") val optionId: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("description", "String", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("label", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("optionId", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b(
    @SerialName("details") val details: RemoteField<JsonElement> = RemoteField.Missing,
    @SerialName("multiSelect") val multiSelect: RemoteField<Boolean> = RemoteField.Missing,
    @SerialName("options") val options: RemoteField<List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b>> = RemoteField.Missing,
    @SerialName("summary") val summary: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("details", "JsonElement", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("multiSelect", "Boolean", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("options", "List<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b>", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("summary", "String", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}
