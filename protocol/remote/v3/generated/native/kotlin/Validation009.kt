// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_c5efb303b347362f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("decided")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c62b342ed89c5809: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("applied")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c64b38404fc9a1d4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c669b4e26b2b7569: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("mcp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c66f09c6212330ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "reason", "refusedBytes", "refusedEvents", "source", "token"), properties = mapOf("createdAt" to schema_56aa0e45cbdce0d0, "reason" to schema_9780f521bc1dee38, "refusedBytes" to schema_56aa0e45cbdce0d0, "refusedEvents" to schema_56aa0e45cbdce0d0, "source" to schema_77a7dec7edfc464f, "token" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c6b76607f48c889e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_21c479c8dedbe09d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c6ca4f58c0a3ffa4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repairedWorktrees"), properties = mapOf("repairedWorktrees" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c721e8abc0a20d4a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "mode" to schema_01e21946e943d3eb, "model" to schema_36fea325bf1aca70, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c733570a5a247812: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command_execution_approval"), JsonPrimitive("file_read_approval"), JsonPrimitive("file_change_approval"), JsonPrimitive("apply_patch_approval"), JsonPrimitive("tool_call_approval"), JsonPrimitive("tool_user_input"), JsonPrimitive("auth_refresh")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7bfc39efc965eed: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unarchive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c94252b9b19bd8f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "reads" to schema_4659e6d395f41e16, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c975fc7daa5c30b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pull-request")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c9a954a3af7049b0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("gui")), defaultValue = JsonPrimitive("terminal"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c9f1be74604b83cb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "task"), properties = mapOf("kind" to schema_1f4518886240126e, "task" to schema_fbbd215f628f20ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca0c8b8a7fbb7b5d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_518b8374aca2de65, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca3d163bab055381: RemoteSchema by lazy {
    RemoteSchema(unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca5f8d6782ca9f6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_2d0b6ec9f2b2decf, "processState" to schema_f156a9bc12c3639a, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca70f506a75e1e3b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"), properties = mapOf("agentSettingsDefaults" to schema_cff1242509563941, "approvalPolicies" to schema_6d1b9ceb7012b646, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizes" to schema_d0b10c04efa78c87, "crossagentMcpRouting" to schema_d1d29954f5424dc9, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_242a5ef77d1f8924, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_88480e7409f5bc30, "liveVoice" to schema_62c3e7fb25ff5c30, "mcpConfigSource" to schema_96776c817a074e1f, "mcpScope" to schema_65e6698fa7640db4, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_b4a8e17084bc4fba, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_6d1b9ceb7012b646, "modes" to schema_429303c2d6a42977, "presentationCapabilities" to schema_f2810a4b129b7156, "presentationMode" to schema_c9a954a3af7049b0, "presentationModes" to schema_553c5c509350e4e7, "readsImageAttachmentsFromHost" to schema_feeb8bb50144d96d, "readsPdfAttachmentsFromHost" to schema_feeb8bb50144d96d, "reportsSkillCatalog" to schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_6d1b9ceb7012b646, "settingDefs" to schema_28b9eff1da2232c5, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_a6ba34cd39bf30c5, "supportsOneShot" to schema_feeb8bb50144d96d, "supportsResume" to schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa, "threadTitleCommands" to schema_fe7aea0f55ed142e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cab926bfae4fdbf9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "cursor" to schema_36fea325bf1aca70, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cadb9042bbcd8536: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_eb2798e2ccc8bf65, "icon" to schema_df704162f3d15808, "mcpServers" to schema_637f685cb2418b8c, "name" to schema_36fea325bf1aca70, "scripts" to schema_3155b0e8649e47af, "searchSettings" to schema_3e412d7b328b3f5a, "worktreeLocation" to schema_137e14636e0bc235), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb2e3d3519422e78: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("deleteBranch" to schema_f8b6dd8128e8bfe0, "expectedBranch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.remove-worktree.owner-requires-branch"))
}

internal val schema_cb34d50832b1e60d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("http"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb7ed3077b38a864: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_bd33bd820cf9daa2, schema_aafcd63530265fa8, schema_c133c6f7b7129d49), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_ccc27289c741798a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "target"), properties = mapOf("credentialRef" to schema_e301e52cd3d3ea46, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "legacyConnectionId" to schema_d855999aed5e6438, "port" to schema_279eee1efa9da6c8, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_cd6770504afebb5a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("configured"), JsonPrimitive("absent"), JsonPrimitive("missing"), JsonPrimitive("retained"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd6e0861b40e2a3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"), properties = mapOf("gitState" to schema_4331716fe2cf5702, "gitSummariesByThread" to schema_aca97eda78815baa, "projects" to schema_d13df6907c0c4975, "projectsNextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "threads" to schema_6c29221885a43de2, "threadsNextCursor" to schema_2d0b6ec9f2b2decf, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_ce6e21bdeb9c2f10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_66d66ce0fd3d9001), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cff1242509563941: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_2b4ffb830b606cf1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d06f3ce55df8317d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("configured"), JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_d13df6907c0c4975: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c35a577df638f4b4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1525f33bd07c0cc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("created" to schema_feeb8bb50144d96d, "ok" to schema_d2dd3595e1b5e5dc, "project" to schema_c35a577df638f4b4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1624ea0ecc46dc6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fast"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_d1a2e6813a174333: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt", "threadId"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_c721e8abc0a20d4a, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1beee40ea84d2e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"), properties = mapOf("fastModePercent" to schema_80c415b6e27c6ebd, "mcpToolCalls" to schema_56aa0e45cbdce0d0, "mostActiveHour" to schema_58f9a3fda2694c76, "skillsExplored" to schema_56aa0e45cbdce0d0, "subagentRuns" to schema_56aa0e45cbdce0d0, "topModel" to schema_9fe1fe9bbcff3ecd, "topProvider" to schema_9fe1fe9bbcff3ecd, "topReasoning" to schema_9fe1fe9bbcff3ecd, "totalSkillsUsed" to schema_56aa0e45cbdce0d0, "workflowRuns" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1c4cb16ae4c331e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "runAt"), properties = mapOf("kind" to schema_e5ee0a072228c0a3, "runAt" to schema_38adcf16c79023ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_d3359b6d5db5b90d: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^SHA256:[A-Za-z0-9+/]{43}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d3749f0d30f56447: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4c1171296b6868a1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d3844584d2058e9c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events"), properties = mapOf("events" to schema_c042d97856b6c5aa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d42717fff211bd92: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "threadId"), properties = mapOf("id" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d4605651dbf9d167: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("episodeToken", "threadId"), properties = mapOf("episodeToken" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d4a49a3cee60b0ec: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_84503a3e631d0429, schema_93cbcfd8dc76a545, schema_0a0c8726ed2784f3), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d4db039cbac5831c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prompt", "threadId"), properties = mapOf("prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d4e60a4c33cd4bbd: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ai")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d50d16380040f1f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commands", "kind"), properties = mapOf("commands" to schema_174f77d24d01fc57, "kind" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d550ef9994fd388f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("input", "type"), properties = mapOf("input" to schema_2c0b30d69cd8870d, "type" to schema_64570e224963bb89), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d566f2fb6a8ab583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("payload", "procedure"), properties = mapOf("payload" to schema_ca3d163bab055381, "procedure" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d59f3565f41b247f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_3e6404f86586fcab, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d613617e76087cfb: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_13762c62f0c23527, schema_19e09b36c5204e8f, schema_a633f9a256d1d0c9, schema_17b50a5a251b31ce, schema_bd23acb1d60bc91b, schema_8f58c1d1acd8bc3c, schema_0ad133ee5894107b, schema_95d0adeb5b1f4c44, schema_4655073d71f8e50b, schema_e65689e97e7d91c3, schema_f1c1581e1729d48e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d66267c393bb4ec4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "enabled", "id", "name", "timeoutMs", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_5296d6b04d46b630), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_d68bbd085678f807: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("pullRequestKey" to schema_2d0b6ec9f2b2decf, "ref" to schema_725be166aa92607b, "refreshedAt" to schema_bf0b727f7b1c6d07, "sourceInfo" to schema_4864c5f65afc8a79, "status" to schema_c1d4a9f752e166b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6a8cd432c4887c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId"), properties = mapOf("fail" to schema_d2dd3595e1b5e5dc, "groupName" to schema_df704162f3d15808, "retire" to schema_7fe780499159088a, "threadId" to schema_36fea325bf1aca70, "worktree" to schema_9645658cf3b0cbb3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_d832acd230fbc919: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "credential", "desired", "environmentId", "label", "legacyConnectionIds", "revision", "runtime", "state", "target", "trust", "updatedAt"), properties = mapOf("childIdentity" to schema_1b0d78a3430b7087, "createdAt" to schema_56aa0e45cbdce0d0, "credential" to schema_d06f3ce55df8317d, "desired" to schema_abff99d05c43ad4c, "environmentId" to schema_d855999aed5e6438, "label" to schema_0c5d3d75e4ff2cec, "lastError" to schema_a03f50bc643a4820, "legacyConnectionIds" to schema_1e591a20b9e55743, "port" to schema_279eee1efa9da6c8, "revision" to schema_f58a8b771657d037, "runtime" to schema_83671e64288686fc, "state" to schema_2c13d2fc1c3e2e03, "target" to schema_a13200e46be7a2e6, "trust" to schema_ecde1f3c1f09bdc0, "updatedAt" to schema_56aa0e45cbdce0d0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_da482300f3faecc5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId", "projectLocation"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_dac2ab59faad66ae: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicies" to schema_d0b10c04efa78c87, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizes" to schema_d0b10c04efa78c87, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_515482d2104d1efa, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_cb81a9dbb81a1a63, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_e163a1a22234ae4f, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_d0b10c04efa78c87, "modes" to schema_acf85c3d3b25a389, "presentationMode" to schema_6508684ba659826b, "presentationModes" to schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_d0b10c04efa78c87, "settingDefs" to schema_113b6f36094df840, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_feeb8bb50144d96d, "supportsResume" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db8efd22aa031937: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dba220fea45f4f88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "id", "state"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "state" to schema_d2a18aed5ce077b0, "submittedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc69d1c3f1fc465e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sourceScope"), properties = mapOf("sourceScope" to schema_6a2600edfb55d776), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_dc806546b8007d0d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "projectsNextCursor", "reads"), properties = mapOf("inventoryFrontier" to schema_36fea325bf1aca70, "projects" to schema_d13df6907c0c4975, "projectsNextCursor" to schema_df704162f3d15808, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc97711e2c23c867: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d66267c393bb4ec4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc99757951407418: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ce6e21bdeb9c2f10, schema_3d188d85aa0799fe), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc9dbbe08067c690: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_35d4f345ae5694ef), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dd4531e3bf06232b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_36fea325bf1aca70, "ticket" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_de00765ac7659be8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}
