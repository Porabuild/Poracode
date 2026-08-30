// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_c1417bffe520aa1c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("mcpServers" to schema_86b938ce61c1942e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1a108aae42275ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "sourceScope"), properties = mapOf("distro" to schema_36fea325bf1aca70, "sourceScope" to schema_86230e1fa3f38188), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_c1d4a9f752e166b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "hasRemote", "isRepo", "remoteInfo", "staged", "totalDeletions", "totalInsertions", "tracking", "unstaged"), properties = mapOf("ahead" to schema_3d06117798bf5171, "behind" to schema_3d06117798bf5171, "branch" to schema_bf0b727f7b1c6d07, "conflictFiles" to schema_1399799a226dcc71, "detail" to schema_15cae388d0cdd5b6, "hasRemote" to schema_feeb8bb50144d96d, "headSha" to schema_bf0b727f7b1c6d07, "isRepo" to schema_feeb8bb50144d96d, "mergeInProgress" to schema_feeb8bb50144d96d, "mergeMessage" to schema_bf0b727f7b1c6d07, "remoteInfo" to schema_9d9cbc9ed0e89822, "staged" to schema_1399799a226dcc71, "totalDeletions" to schema_3d06117798bf5171, "totalInsertions" to schema_3d06117798bf5171, "tracking" to schema_bf0b727f7b1c6d07, "unstaged" to schema_1399799a226dcc71), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1f357f1f88472e8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("starting"), JsonPrimitive("active"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c263982707afed92: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("percent"), JsonPrimitive("tokens"), JsonPrimitive("requests"), JsonPrimitive("credits"), JsonPrimitive("usd")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2894654f12fb350: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-frame")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2dab688715f1ae7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_13762c62f0c23527, schema_8f72d273465cb93f, schema_67185a39458481f6, schema_17b50a5a251b31ce, schema_bd23acb1d60bc91b, schema_8f58c1d1acd8bc3c, schema_0ad133ee5894107b, schema_95d0adeb5b1f4c44, schema_a7af012dd26c2f45), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2e8606952666d2c: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_6bb6e13415c8cbba, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c30da54b853babca: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "percent", "provider", "tokens"), properties = mapOf("estimatedCostUsd" to schema_80c415b6e27c6ebd, "label" to schema_bf0b727f7b1c6d07, "percent" to schema_80c415b6e27c6ebd, "provider" to schema_bf0b727f7b1c6d07, "tokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c3363423bb669510: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4ec1299a984102e2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c39ba2db208f4f7c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("activate-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c3ac2139868061bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c4197e46f3baa871: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c44733d5a3f1db00: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_efedb06a4d7088a5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c4ad1400e2e98f57: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("limit" to schema_039b848cf1c1ad6c, "projectLocation" to schema_080f9cc154af9e27, "query" to schema_38d1a07d3b9b1c82, "searchConfig" to schema_cbf78da83a6846d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c4d99dd3e3a1ba03: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("detail" to schema_15cae388d0cdd5b6, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c51ef8291e597045: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c55a346c739cb16c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "payload", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_9189c3f251645aa9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5c2ecebbae5cd01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs"), properties = mapOf("modifiedAtMs" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c64b38404fc9a1d4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c669b4e26b2b7569: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("mcp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c6773b11bd57a846: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_fc5c2dcf1808cfc9, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_311561bc27718240, schema_cdd89e732d29ca0e, schema_9b83e18a93c4ec45, schema_15179deb98a23815, schema_e01133268267ec38, schema_e9d3d0a9b8562d03, schema_f7a8f7639015cad8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c6b76607f48c889e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_21c479c8dedbe09d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c733570a5a247812: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command_execution_approval"), JsonPrimitive("file_read_approval"), JsonPrimitive("file_change_approval"), JsonPrimitive("apply_patch_approval"), JsonPrimitive("tool_call_approval"), JsonPrimitive("tool_user_input"), JsonPrimitive("auth_refresh")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7bfc39efc965eed: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unarchive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7d4ec01c19bbb3a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8ebc98d914ab234d, schema_2c21c4a9623808ef, schema_e7cab2d2c052144f, schema_09f700fdeb3e5213), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7e9848de3a346ed: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.routing.identifier-no-controls"))
}

internal val schema_c8425979fd5d4887: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forbidden"), JsonPrimitive("not-found"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8709e27df818d5b: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 80, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8aab5b657a17f5e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0dd86a486b36c18a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c975fc7daa5c30b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pull-request")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c9a954a3af7049b0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("gui")), defaultValue = JsonPrimitive("terminal"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca0c8b8a7fbb7b5d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_518b8374aca2de65, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca3d163bab055381: RemoteSchema by lazy {
    RemoteSchema(unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb1609a78d94099a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_57f3fe3c4372de75), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb2e3d3519422e78: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("deleteBranch" to schema_f8b6dd8128e8bfe0, "expectedBranch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.remove-worktree.owner-requires-branch"))
}

internal val schema_cb34d50832b1e60d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("http"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb81a9dbb81a1a63: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("server")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbad4936b49ad671: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_da546ba4a0601e6e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbc64d14585e9a92: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbf78da83a6846d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("excludePatterns", "useIgnoreFiles"), properties = mapOf("excludePatterns" to schema_0f732b9fceb2c6ac, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cc1f68c41f086183: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ccd3eb53d3a096b7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("directoryPath", "entries"), properties = mapOf("directoryPath" to schema_bf0b727f7b1c6d07, "entries" to schema_bdb4eecbb625c500), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd0a57f27ae4fccb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9dee5b496693b179, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd124b21d98c4aa2: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("actions" to schema_9f0df99b7a4b0249, "cleanupScript" to schema_bf0b727f7b1c6d07, "setupScript" to schema_bf0b727f7b1c6d07, "worktreeCopyPatterns" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd357f47aa772b6a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0288aefad61e0244, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cda18ebe4af54c5c: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdc63841ca583c5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "type", "vars"), properties = mapOf("description" to schema_2d0b6ec9f2b2decf, "id" to schema_36fea325bf1aca70, "link" to schema_2d0b6ec9f2b2decf, "name" to schema_36fea325bf1aca70, "type" to schema_aaf42afe3bc86594, "vars" to schema_02f62ff4e29426df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdcee850f284e657: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdd89e732d29ca0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_1fbc0e0d793ae9f1, "usage" to schema_80ac3a097b3c79c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ce0c89ac5eec78ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ce6e21bdeb9c2f10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_66d66ce0fd3d9001), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cff1242509563941: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_2b4ffb830b606cf1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cfff1874b09bd142: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("schedules"), properties = mapOf("schedule" to schema_936535b2f1c97eac, "schedules" to schema_2ad366bf61312387), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0b10c04efa78c87: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a59d7f7afd3350b1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0ecd43b5f1b261a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0fa817300598095: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c30da54b853babca, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d12ea655163290cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("run")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d15a69227c93754c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessToken", "expiresAt", "scopes", "tokenType"), properties = mapOf("accessToken" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "scopes" to schema_515482d2104d1efa, "tokenType" to schema_7c8fd050dd5e98a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1beee40ea84d2e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"), properties = mapOf("fastModePercent" to schema_80c415b6e27c6ebd, "mcpToolCalls" to schema_56aa0e45cbdce0d0, "mostActiveHour" to schema_58f9a3fda2694c76, "skillsExplored" to schema_56aa0e45cbdce0d0, "subagentRuns" to schema_56aa0e45cbdce0d0, "topModel" to schema_9fe1fe9bbcff3ecd, "topProvider" to schema_9fe1fe9bbcff3ecd, "topReasoning" to schema_9fe1fe9bbcff3ecd, "totalSkillsUsed" to schema_56aa0e45cbdce0d0, "workflowRuns" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1d1696e7dc33885: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop"), JsonPrimitive("helper")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1d29954f5424dc9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-token"), JsonPrimitive("provider-session")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1df243f455504fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("message" to schema_bf0b727f7b1c6d07, "messageKey" to schema_bf0b727f7b1c6d07, "type" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1eba06c8a5dc0a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notes"), properties = mapOf("notes" to schema_6df40201d8c95128), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d21b71d44dcb47ab: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("succeeded"), JsonPrimitive("failed"), JsonPrimitive("interrupted")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d221b1853eb0ef37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prefixes"), properties = mapOf("fallbackRuntime" to schema_36fea325bf1aca70, "prefixes" to schema_b84e449d1a150abf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d2299af726097d6c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("interests", "type"), properties = mapOf("interests" to schema_f1666190cd652261, "type" to schema_9f1edfda198d533d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d2a18aed5ce077b0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("APPROVED"), JsonPrimitive("CHANGES_REQUESTED"), JsonPrimitive("COMMENTED"), JsonPrimitive("DISMISSED"), JsonPrimitive("PENDING")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d2dd3595e1b5e5dc: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", literals = listOf(JsonPrimitive(true)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d2ec5bf10f13829b: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("path" to schema_38d1a07d3b9b1c82), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d3749f0d30f56447: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4c1171296b6868a1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d550ef9994fd388f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("input", "type"), properties = mapOf("input" to schema_2c0b30d69cd8870d, "type" to schema_64570e224963bb89), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d566f2fb6a8ab583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("payload", "procedure"), properties = mapOf("payload" to schema_ca3d163bab055381, "procedure" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d57a243fc11d5ac6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "capabilities", "installed", "kind", "label"), properties = mapOf("authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "capabilities" to schema_db4171da44a5515a, "envDistro" to schema_bf0b727f7b1c6d07, "envKind" to schema_9eed5c4959909cfe, "executablePath" to schema_bf0b727f7b1c6d07, "icon" to schema_bf0b727f7b1c6d07, "installed" to schema_feeb8bb50144d96d, "kind" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "loginCommand" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationAuthStates" to schema_678d084ee287670a, "presentationAuthUsesProviderLogin" to schema_473e9b7f4728cf72, "providerMetadata" to schema_197c2b8c01d7f4ed, "runtimeVariants" to schema_28571b7aa62ce1e4, "sessionRuntimeRouting" to schema_d221b1853eb0ef37, "update" to schema_ae00c10b95f24c44, "version" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d66267c393bb4ec4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "enabled", "id", "name", "timeoutMs", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_5296d6b04d46b630), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_d68bbd085678f807: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("pullRequestKey" to schema_2d0b6ec9f2b2decf, "ref" to schema_725be166aa92607b, "refreshedAt" to schema_bf0b727f7b1c6d07, "sourceInfo" to schema_4864c5f65afc8a79, "status" to schema_c1d4a9f752e166b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6e0ba68c8b32de4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("installed"), properties = mapOf("installed" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d715cb198ae66d56: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_458a4508393abce2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d73ffe960ceccb3f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("diff_comment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d7cf7473af61f30a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sourceBranch", "worktreeLocation"), properties = mapOf("preserveLocalChanges" to schema_f8b6dd8128e8bfe0, "sourceBranch" to schema_36fea325bf1aca70, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d855999aed5e6438: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8768c073f68fc35: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pong")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8ae5c3a60a788cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_a20681cb358b7044, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8b225d7de9ceec5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8fa37f0ae821721: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_a467b0ed1c0ea208, schema_056ce41be8f105d9, schema_b12a7fe10e067771), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d92866345cd97821: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "latencyMs" to schema_56aa0e45cbdce0d0, "serverInfo" to schema_820293e02a103abf, "status" to schema_7ce40fcb9f4c6111, "toolCount" to schema_56aa0e45cbdce0d0, "tools" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d92fe09fa7f298ab: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("request.resolved")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d95fd60152159d7a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "prNumber", "projectId"), properties = mapOf("branch" to schema_36fea325bf1aca70, "includeReviewBundle" to schema_feeb8bb50144d96d, "kind" to schema_c975fc7daa5c30b3, "prNumber" to schema_23e05d248383ea40, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9640543f6c97ed9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("resync-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9ae4e225fe9170f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "pr" to schema_a4457c545e0e0489, "repository" to schema_bf0b727f7b1c6d07, "reviewRequested" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da37aeddd0e606ac: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a99c73e81a312991, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da546ba4a0601e6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentId", "label"), properties = mapOf("agentId" to schema_36fea325bf1aca70, "attempt" to schema_56aa0e45cbdce0d0, "chat" to schema_1d8def7ed78e9628, "durationMs" to schema_56aa0e45cbdce0d0, "label" to schema_36fea325bf1aca70, "lastProgressAt" to schema_3d06117798bf5171, "lastToolName" to schema_bf0b727f7b1c6d07, "model" to schema_bf0b727f7b1c6d07, "phaseIndex" to schema_56aa0e45cbdce0d0, "phaseTitle" to schema_bf0b727f7b1c6d07, "promptPreview" to schema_bf0b727f7b1c6d07, "queuedAt" to schema_3d06117798bf5171, "resultPreview" to schema_bf0b727f7b1c6d07, "startedAt" to schema_3d06117798bf5171, "state" to schema_5a17efba356f5500, "tokens" to schema_56aa0e45cbdce0d0, "toolCalls" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da66851500474562: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath", "source"), properties = mapOf("kind" to schema_8793e380887b215f, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da76232259cbe6bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("avatarColor", "handle", "name"), properties = mapOf("avatarColor" to schema_8f8e73cb353005a1, "handle" to schema_485fa06696a88681, "name" to schema_c8709e27df818d5b, "plan" to schema_485fa06696a88681), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db4171da44a5515a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"), properties = mapOf("agentSettingsDefaults" to schema_cff1242509563941, "approvalPolicies" to schema_6d1b9ceb7012b646, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizes" to schema_d0b10c04efa78c87, "crossagentMcpRouting" to schema_d1d29954f5424dc9, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_242a5ef77d1f8924, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_88480e7409f5bc30, "mcpConfigSource" to schema_96776c817a074e1f, "mcpScope" to schema_65e6698fa7640db4, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_b4a8e17084bc4fba, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_6d1b9ceb7012b646, "modes" to schema_429303c2d6a42977, "presentationCapabilities" to schema_427601a9d9ee2f62, "presentationMode" to schema_c9a954a3af7049b0, "presentationModes" to schema_553c5c509350e4e7, "readsPdfAttachmentsFromHost" to schema_feeb8bb50144d96d, "reportsSkillCatalog" to schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_6d1b9ceb7012b646, "settingDefs" to schema_28b9eff1da2232c5, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_a6ba34cd39bf30c5, "supportsOneShot" to schema_feeb8bb50144d96d, "supportsResume" to schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db6663ca6967264f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("config" to schema_03b0262a8a76c7b7, "prompt" to schema_36fea325bf1aca70, "segments" to schema_a85bbc4abd9b5411, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db8efd22aa031937: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dba220fea45f4f88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "id", "state"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "state" to schema_d2a18aed5ce077b0, "submittedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc09cb764665b81c: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ab58da84eaa66434, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc69d1c3f1fc465e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sourceScope"), properties = mapOf("sourceScope" to schema_6a2600edfb55d776), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_dc97711e2c23c867: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d66267c393bb4ec4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc99757951407418: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ce6e21bdeb9c2f10, schema_3d188d85aa0799fe), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_de00765ac7659be8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_deb61378c1ff010b: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_cff1242509563941, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("agent-settings.strip-sensitive"))
}

internal val schema_df37d0da6ffc8371: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("title"), properties = mapOf("title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df704162f3d15808: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_36fea325bf1aca70, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df7fa3d1be8ffbea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoints", "turns"), properties = mapOf("checkpoints" to schema_12344c6d82d54c6d, "turns" to schema_203e1407dc2d843e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df96bd315b4c0dae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("anchorItemId", "endedAt", "startedAt"), properties = mapOf("anchorItemId" to schema_2d0b6ec9f2b2decf, "endedAt" to schema_36fea325bf1aca70, "startedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e01133268267ec38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("outcome", "requestId", "threadId", "type"), properties = mapOf("outcome" to schema_506f036707472345, "requestId" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_d92fe09fa7f298ab), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0bc631a257fd15a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "identity"), properties = mapOf("device" to schema_26f96950d20651b3, "identity" to schema_da76232259cbe6bb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0da1e0a5e3cd077: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}
