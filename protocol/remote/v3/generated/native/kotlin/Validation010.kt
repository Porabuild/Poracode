// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_aaf42afe3bc86594: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("env_var")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aafcd63530265fa8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "revision"), properties = mapOf("kind" to schema_442f4438e0362260, "record" to schema_1be5ac91cc4357cb, "revision" to schema_36fea325bf1aca70, "rows" to schema_a16cb9740d19657e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab08aad343958c81: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "status" to schema_0200f968d21b338b, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.ready-range-utf16"))
}

internal val schema_ab5271048956dc05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab6b873225f5c96a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-mirror-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab9af0b233ebeb7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "inputAdmission", "proxyHelpers", "streamSettings", "url"), properties = mapOf("device" to schema_97d85a5eaee82b97, "inputAdmission" to schema_d2dd3595e1b5e5dc, "proxyHelpers" to schema_d2dd3595e1b5e5dc, "streamSettings" to schema_e0e12d4798687ab0, "url" to schema_833ba85e740a223b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aba5d69bfdbd30c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseModifiedAtMs", "content", "path", "projectLocation"), properties = mapOf("baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abcfe9be3ea6f135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("initialDelaySeconds", "kind", "maxAttempts", "maxDelaySeconds"), properties = mapOf("initialDelaySeconds" to schema_e9f57f9b4751d6e1, "kind" to schema_1dff9447e3354b05, "maxAttempts" to schema_f7164d030c9bbeaf, "maxDelaySeconds" to schema_e9f57f9b4751d6e1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abff99d05c43ad4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("enabled"), JsonPrimitive("disabled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac157d37d82304b4: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 240, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_ac3d09b5c7f361d2: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_cb95bf43ec62db01, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac6ea0fc110d7efb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac7865b2a567eb07: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("days", "kind", "time"), properties = mapOf("days" to schema_f7b2db2c4c7fbdd3, "kind" to schema_475f91db7d51b153, "time" to schema_b61004d40d3caef8, "timeZone" to schema_be5d5f9829abefd6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac9a64d31e1a0a07: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "completedTurnsNextCursor", "contextUsage", "reads", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("backgroundTasks" to schema_00675d64d428c3d1, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "historyProjection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimeItems" to schema_5d3ac76d9a521e1d, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_19a6d2a8a6f0687c, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aca97eda78815baa: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_b2a9cad3f0f3b617, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acccf296d86b4026: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("experiments", "revision"), properties = mapOf("experiments" to schema_2f3c74eaed971b9f, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acf85c3d3b25a389: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad1d9fe8b3eda038: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e2d96ee09e9d99a2, schema_d95fd60152159d7a, schema_591e7e71be40d4d4), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad31e0c5f63e1a50: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("beforePosition" to schema_56aa0e45cbdce0d0, "deferBodies" to schema_30a537a9343bcdf7, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad6bb2de51c0e05f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_e22de6db69f83369), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_adaa80878b467841: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("effort"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ae26bc52b712b00c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae3b637db050db2a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1be1630ac362ee37, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae4a7605815e4393: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archivedAt", "changedFiles", "outcome", "severity", "stopReason", "summary", "unread"), properties = mapOf("archivedAt" to schema_595da89b21b7ca56, "changedFiles" to schema_3f02a5451ac550c4, "completionEvaluation" to schema_b2d5bb9fac49f2fc, "outcome" to schema_75fa28583d2c03c2, "severity" to schema_2d5efa5a796cb8bd, "stopReason" to schema_7bbdba78cb64cd5f, "summary" to schema_74b3a4e21747a253, "unread" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae682752b1c14d17: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forge"), JsonPrimitive("host")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af6b6f72d4304b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af80d040598805ef: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1e25c599a64f5b9d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af9e7187ee39d2c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "path", "providerId"), properties = mapOf("message" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "providerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_afbf6761fa459396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("existingProjectIds", "existingThreadIds"), properties = mapOf("existingProjectIds" to schema_515482d2104d1efa, "existingThreadIds" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b01e26e0438140cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "worktreePath"), properties = mapOf("kind" to schema_a1f40266b6e1acfa, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b0304b9d9dfc2690: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCache", "snapshots"), properties = mapOf("fromCache" to schema_feeb8bb50144d96d, "snapshots" to schema_c5a10234205e6cd2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b03238f5530b04fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "shellId"), properties = mapOf("initialSize" to schema_55ee222c096690dc, "projectLocation" to schema_080f9cc154af9e27, "shellId" to schema_36fea325bf1aca70, "startInHome" to schema_feeb8bb50144d96d, "windowsShellRuntime" to schema_9368b22ce42bb60e, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b03a8b1facfb96ed: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "excerpts", "files", "lookClosely", "questions", "title"), properties = mapOf("body" to schema_5c07f5964567e9f0, "excerpts" to schema_fece443c82df794e, "files" to schema_0c6254245418ba4c, "lookClosely" to schema_feeb8bb50144d96d, "questions" to schema_4e014bc9e6085564, "title" to schema_e7c7f30aecaa99f0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b06a4d4952079732: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_03acf09008f7905b, "projects" to schema_1ad39f29d63bca89), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b096158c792e0431: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill"), JsonPrimitive("subagent"), JsonPrimitive("tool"), JsonPrimitive("mcp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b09b259cd2bbc25d: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("slashCommands" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b160fc20dd335dc3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("workspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b202a6626ea9d1ee: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 600, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b23ca9582f16c4d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("browserFocus" to schema_f9c97c26b130e744, "conversationSnapshot" to schema_8532cee498146283), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2a9cad3f0f3b617: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"), properties = mapOf("ahead" to schema_56aa0e45cbdce0d0, "behind" to schema_56aa0e45cbdce0d0, "branch" to schema_bf0b727f7b1c6d07, "isRepo" to schema_feeb8bb50144d96d, "pr" to schema_9d263023fc1dd3de, "totalDeletions" to schema_56aa0e45cbdce0d0, "totalInsertions" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2c8fd1712ed6830: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "projectId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_f69100925fc0e774, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2ca36e3fa7743ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "order" to schema_42146530bc4d74c4, "projectLimit" to schema_85b777c0c99bbbca, "reads" to schema_4659e6d395f41e16, "summaries" to schema_feeb8bb50144d96d, "threadLimit" to schema_85b777c0c99bbbca), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2d5bb9fac49f2fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("condition", "confidence", "evaluatedAt", "reason", "stopMatched"), properties = mapOf("condition" to schema_5c6957eaa59e2ae2, "confidence" to schema_5d4b39004bf5c532, "evaluatedAt" to schema_38adcf16c79023ce, "reason" to schema_89c223893a706cf8, "stopMatched" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b305c5dcc2d06cc2: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^gemini:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b31e6e34985b5bbc: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8d889103a9834b21, schema_b01e26e0438140cd, schema_b34d955e5d0e517e, schema_21cd039cb32b3851, schema_1ae7de2180f145f4, schema_2e4d2aaed030369e, schema_c3363423bb669510, schema_80906c6ddc7c6c9e, schema_ebd70a208b453fe1, schema_b79d8f64de4f41bd, schema_09765c7778825d10, schema_431be1ab7e1b0dc9, schema_a93ba7bf23f9b121, schema_370ff0ec0af5649a, schema_2062bc5ac9057c02, schema_efd9410c7543c4c0, schema_69af29ff385f1e03, schema_4985039121b532af), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b34d955e5d0e517e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "prompt"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_4153fde9f3f8106b, "focus" to schema_feeb8bb50144d96d, "groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_60fc988aefaed4f5, "launchRuntime" to schema_feeb8bb50144d96d, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "title" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3ef93117a9f9f95: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("portrait"), JsonPrimitive("landscape_left"), JsonPrimitive("portrait_upside_down"), JsonPrimitive("landscape_right")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4441316f1aafac9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "labelKey", "options"), properties = mapOf("id" to schema_36fea325bf1aca70, "labelKey" to schema_36fea325bf1aca70, "options" to schema_1d53b68fd3881a00), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4a8e17084bc4fba: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b53074e6b68baa67: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"), properties = mapOf("contentType" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "modifiedAtMs" to schema_f696f11685898ba7, "sizeBytes" to schema_56aa0e45cbdce0d0, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b588ef57ebadea7a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4ec1d31e87eeb7a4, schema_a93427ae1fb25d32), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5c1f44eaf04477b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("assistant_text"), JsonPrimitive("reasoning_text"), JsonPrimitive("plan_text"), JsonPrimitive("command_output"), JsonPrimitive("file_change_output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5d08cec4c32205e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("anchor", "threadId"), properties = mapOf("anchor" to schema_98ef330d70f2e681, "config" to schema_4153fde9f3f8106b, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5e66c2e9667a210: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bearer-access-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b61004d40d3caef8: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6411354a37352f2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38754692c8b5ebef, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b664e76046bb1915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("format", "text", "version"), properties = mapOf("format" to schema_f1ccd99fb2bc2c2f, "text" to schema_ee49ed668eec9d78, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b67f4828f001c119: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ca5f8d6782ca9f6b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6a98d4e6efc4f4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("model"), JsonPrimitive("config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6aaa17d322b8355: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b79d8f64de4f41bd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "worktreePath"), properties = mapOf("isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_49f72e8cc565067e, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7ac3adaa07b7aa4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7c373d0981a5441: RemoteSchema by lazy {
    RemoteSchema(type = "null", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7f9b9a51ee842c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prompts"), JsonPrimitive("tokens")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b84e449d1a150abf: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_36fea325bf1aca70, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b89c357946c21293: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_b8f3bd9de101caa0: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 500, items = schema_b03a8b1facfb96ed, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b92447920382853b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("providerId", "providerLabel", "servers", "sourcePath"), properties = mapOf("providerId" to schema_36fea325bf1aca70, "providerLabel" to schema_36fea325bf1aca70, "servers" to schema_409712bfaed84392, "sourcePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b99ee3af304513c2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("device"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b9d24da8425fcc77: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "retryable", "status"), properties = mapOf("code" to schema_c8425979fd5d4887, "reason" to schema_36fea325bf1aca70, "retryable" to schema_feeb8bb50144d96d, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b9dfb5a053707da9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ba7dfbe6c754d186: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 160, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bab85ee50a59610a: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 3, maxLength = 255, pattern = "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_badd682f3501e022: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_baf4f355dd2fd6ae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a799b0e11ed8f6df, "usage" to schema_4fb4f0ac85464c4a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb2e0e6d90c93ccf: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb3cd72cf9e1b0cc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_4d34acc64dd77a5d, "result" to schema_bea1bdef18933d97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb42560f34ae61e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "label", "type"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "label" to schema_bf0b727f7b1c6d07, "topModel" to schema_bf0b727f7b1c6d07, "topProvider" to schema_bf0b727f7b1c6d07, "type" to schema_645d18fd9a611f68), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb479bc5848b9f45: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skip"), JsonPrimitive("coalesce"), JsonPrimitive("run-latest")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb755d8d8c6227a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("previewId"), properties = mapOf("device" to schema_97d85a5eaee82b97, "previewId" to schema_d855999aed5e6438), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_bc1920595e8cfd89: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("schedules"), properties = mapOf("schedule" to schema_14f6b52f84064da4, "schedules" to schema_bc6010db82e83d09), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc6010db82e83d09: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_14f6b52f84064da4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc6c91ba1621863d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "host", "login"), properties = mapOf("active" to schema_feeb8bb50144d96d, "host" to schema_bf0b727f7b1c6d07, "login" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc731d8f39fdb4bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "status"), properties = mapOf("oldPath" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "status" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc92ea89e2de4f6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("doc", "projectId", "todos", "updatedAt"), properties = mapOf("doc" to schema_6e4ad578250cef79, "projectId" to schema_36fea325bf1aca70, "todos" to schema_e7c244bd461f7229, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bcff7a89192b7e6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_150828825a4ec4d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd136ee4bcce8b07: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloading")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd23acb1d60bc91b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state", "type"), properties = mapOf("state" to schema_ecc6edb6166acda9, "type" to schema_47e02a8368712956), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd2deb493c08ce37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "title"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd85a52dd25effae: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4096, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd96f28e94e5dff9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("redirect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd9ee7d62499d1b2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("launchApp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdadccb73a92373f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3, "setUpstream" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdb4eecbb625c500: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c073582d4fa79e4e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be268483fb86810f: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 500.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be5d5f9829abefd6: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.time-zone", "string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_bea1bdef18933d97: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_d92866345cd97821, schema_8ace86d01d0cc126, schema_2a43ea36a62fa6ac), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf0b727f7b1c6d07: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf3a4ed0e5798352: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7a4831c3c01cfb91, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf4561eb7adf4d72: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf61c597568a8798: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "id", "isOutdated", "isResolved"), properties = mapOf("comments" to schema_ac3d09b5c7f361d2, "id" to schema_bf0b727f7b1c6d07, "isOutdated" to schema_feeb8bb50144d96d, "isResolved" to schema_feeb8bb50144d96d, "line" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07, "side" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bfc0c020a52f85b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive("origin"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c028422c57a7c557: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c02fd6d3e2467512: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_4153fde9f3f8106b, "numTurns" to schema_f58a8b771657d037, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c04b1452d18edb3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_0e40f389d72655d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_c052748939bdd575: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 8, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c0551fbf082fff0f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("approve"), JsonPrimitive("request-changes"), JsonPrimitive("comment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c073582d4fa79e4e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("hasChildren" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c086073e61ba1068: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c0edab91e2f5d96e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_cd6770504afebb5a, "problem" to schema_6ef72b13e31a5a70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1094a243b47f83c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cells", "max", "metric", "windowDays"), properties = mapOf("cells" to schema_08654ec33ed5db02, "max" to schema_56aa0e45cbdce0d0, "metric" to schema_b7f9b9a51ee842c4, "windowDays" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
