// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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
data class ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3(
    @SerialName("absolutePath") val absolutePath: String,
    @SerialName("availability") val availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = RemoteField.Missing,
    @SerialName("description") val description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("enabled") val enabled: Boolean,
    @SerialName("folderName") val folderName: String,
    @SerialName("id") val id: String,
    @SerialName("importState") val importState: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7> = RemoteField.Missing,
    @SerialName("invalidReason") val invalidReason: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61> = RemoteField.Missing,
    @SerialName("invocation") val invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6> = RemoteField.Missing,
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
            RemoteFieldDescriptor("description", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("enabled", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("folderName", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("id", "String", true, false, null, null, 1, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("importState", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invalidReason", "ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invocation", "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", false, false, null, null, null, null, null, null, null, null, listOf()),
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
data class ProcedurescanSkillsResult_f958c6e1fa(
    @SerialName("canLinkToGlobal") val canLinkToGlobal: Boolean,
    @SerialName("effectiveSkillIds") val effectiveSkillIds: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("invocation") val invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6>,
    @SerialName("issues") val issues: List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>,
    @SerialName("skills") val skills: List<ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3>,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("canLinkToGlobal", "Boolean", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("effectiveSkillIds", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("invocation", "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", true, true, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("issues", "List<ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee>", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("skills", "List<ProcedurescanSkillsResultU2DSkillsU2DItem_56a9bf5bf3>", true, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a(
    @SerialName("excludePatterns") val excludePatterns: List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>,
    @SerialName("useIgnoreFiles") val useIgnoreFiles: Boolean,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("excludePatterns", "List<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>", true, false, null, null, null, null, null, null, null, null, listOf()),
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
    @SerialName("name") val name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("path") val path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b,
    @SerialName("type") val type: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("name", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("path", "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", true, false, null, null, null, null, null, null, null, null, listOf()),
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
