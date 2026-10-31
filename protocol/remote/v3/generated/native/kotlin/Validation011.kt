// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_c028422c57a7c557: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c133c6f7b7129d49: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("candidateDisposition", "kind", "revision"), properties = mapOf("candidateDisposition" to schema_60232db9c637a046, "kind" to schema_034741cb26a53fe4, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1417bffe520aa1c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("mcpServers" to schema_86b938ce61c1942e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1504401bd291fd1: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4096, pattern = "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1862c8cf975e3dc: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 3145728, pattern = "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c18ccc2aa36fdad0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "roles", "version"), properties = mapOf("crewId" to schema_7d62681c6488867d, "name" to schema_eef7e0a1ed6691c0, "policy" to schema_5e585becfdaebc00, "roles" to schema_5994d84d0d782ee0, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_c223d7ef6abf4cfd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_e301e52cd3d3ea46, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c263982707afed92: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("percent"), JsonPrimitive("tokens"), JsonPrimitive("requests"), JsonPrimitive("credits"), JsonPrimitive("usd")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c26b952dfa583dcd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "title"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "config" to schema_281d24bbbaa46745, "groupId" to schema_bf0b727f7b1c6d07, "groupName" to schema_bf0b727f7b1c6d07, "kind" to schema_1f4518886240126e, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_80c415b6e27c6ebd, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "title" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c286f4704a09cde8: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 100, items = schema_2e59da965e611892, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c288e6607451a3b8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("versions"), properties = mapOf("livePreview" to schema_8b16df449d9a1954, "versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2894654f12fb350: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-frame")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2956fa26ec0467c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("content", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "reacted"), properties = mapOf("content" to schema_7d62681c6488867d, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "reacted" to schema_feeb8bb50144d96d, "subjectId" to schema_97d85a5eaee82b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c2bb40b82b330cd4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forge", "host", "login"), properties = mapOf("forge" to schema_eaed3cfbf46d5d81, "host" to schema_2365fa95161a3294, "login" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c33d76cdf9c7d5d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "model"), properties = mapOf("agentKind" to schema_8e43cad70cd70de7, "contextSize" to schema_7d62681c6488867d, "effort" to schema_7d62681c6488867d, "fast" to schema_feeb8bb50144d96d, "model" to schema_97d85a5eaee82b97), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_c37d7c3aee05c236: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_6ddf4b7dc1e0e9e2, schema_2c6061a21fb7aee6, schema_8c04d0a06a161126, schema_83384e1a092392f6, schema_a36830c34a81f248, schema_0b2ba27512e423eb), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c39ba2db208f4f7c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("activate-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c3a4dfd6503d3858: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notice", "outcome"), properties = mapOf("notice" to schema_1468dfe9a2db9c9d, "outcome" to schema_552de755ef856a71), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c3ac2139868061bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c4197e46f3baa871: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c43cb4446ad9adb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1168c5b9dd9a5f10, schema_3b92361dc8708ea3), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c44733d5a3f1db00: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_efedb06a4d7088a5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c4921dbeb36e2b97: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e510e581c4f8b523, schema_77c71c73158736b6), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c52c624815ab6ea5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archived", "excerpt", "itemId", "projectId", "projectName", "role", "threadId", "title"), properties = mapOf("archived" to schema_feeb8bb50144d96d, "excerpt" to schema_ff3b9b0284fcd244, "itemId" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70, "projectName" to schema_e78f40fc5399f7f1, "role" to schema_ff05783d57039aa1, "threadId" to schema_36fea325bf1aca70, "title" to schema_f7ecfe1017b42566), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c533fb875972ec60: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("result", "version", "watchId"), properties = mapOf("result" to schema_80f7976aee3c4505, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c55a346c739cb16c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "payload", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_9189c3f251645aa9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c591e31c389e744f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_160c1ab9b7f11a56, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5a10234205e6cd2: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_20d7b1e748f886c3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5a25a432208abbf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("appearance")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5c17f76a21e5ff1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5c2ecebbae5cd01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs"), properties = mapOf("modifiedAtMs" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5c5a6d768bddd81: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 100.0, maximum = 2000.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c5efb303b347362f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("decided")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c62b342ed89c5809: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("applied")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c641a5324383dc1b: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "crews" to schema_91181085efd88304, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_79608b5eceb792fe, "enabledMcpServers" to schema_cda18ebe4af54c5c, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_49162371ff415b49, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_b6aaa17d322b8355, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c64b38404fc9a1d4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c65389518caf6991: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "kind"), properties = mapOf("actor" to schema_a99c73e81a312991, "createdAt" to schema_bf0b727f7b1c6d07, "fromRef" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "kind" to schema_7d62681c6488867d, "label" to schema_2e20b523bd887c4e, "reviewer" to schema_423ec18ef5ab4596, "text" to schema_bf0b727f7b1c6d07, "toRef" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c664f13e067b9fbd: RemoteSchema by lazy {
    RemoteSchema(type = "integer", maximum = 2048.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c70a9f86327c7bf7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commit", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("commit" to schema_ef369ae84db5485c, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c733570a5a247812: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command_execution_approval"), JsonPrimitive("file_read_approval"), JsonPrimitive("file_change_approval"), JsonPrimitive("apply_patch_approval"), JsonPrimitive("tool_call_approval"), JsonPrimitive("tool_user_input"), JsonPrimitive("auth_refresh")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7918abeb45791aa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pullRequests"), properties = mapOf("pullRequests" to schema_f86171557f2ff456, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7bfc39efc965eed: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unarchive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7d6a559534154dd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repository"), properties = mapOf("repository" to schema_2e5ddb0a3afed2cb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c8c48a1118d06f0b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("textSize")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8ef822f0af9edc7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ad6bb2de51c0e05f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_ca5f8d6782ca9f6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_2d0b6ec9f2b2decf, "processState" to schema_f156a9bc12c3639a, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca8d08ed24dcae50: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "indexing", "nextCursor", "version"), properties = mapOf("entries" to schema_da9e94c933512927, "indexing" to schema_feeb8bb50144d96d, "nextCursor" to schema_e333e5cd970cf11f, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca98effeead73f13: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "type"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "type" to schema_3ac0e8087f32acdf), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_cab926bfae4fdbf9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "cursor" to schema_36fea325bf1aca70, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cac7783fa7c0ea01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "path"), properties = mapOf("fingerprint" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_cb81a9dbb81a1a63: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("server")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb95bf43ec62db01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "createdAt", "id"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "reactions" to schema_45e52f032f196485, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_cc9733aab3f25827: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "commentId", "expectedBody", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "commentId" to schema_97d85a5eaee82b97, "expectedBody" to schema_bf0b727f7b1c6d07, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_97d85a5eaee82b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cc9f9333ba81f5d3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"), properties = mapOf("gitState" to schema_edbeeba28e8d2dd8, "gitSummariesByThread" to schema_aca97eda78815baa, "projects" to schema_77c06377e1bf6e10, "projectsNextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "snapshotEpoch" to schema_8e43cad70cd70de7, "snapshotSeq" to schema_56aa0e45cbdce0d0, "threads" to schema_a5ae4ed4358535a0, "threadsNextCursor" to schema_2d0b6ec9f2b2decf, "updatedAt" to schema_36fea325bf1aca70, "workspaces" to schema_15fcce03de60030d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ccc27289c741798a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "target"), properties = mapOf("credentialRef" to schema_e301e52cd3d3ea46, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "legacyConnectionId" to schema_d855999aed5e6438, "port" to schema_279eee1efa9da6c8, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ccd3eb53d3a096b7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("directoryPath", "entries"), properties = mapOf("directoryPath" to schema_bf0b727f7b1c6d07, "entries" to schema_bdb4eecbb625c500), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ccd4545c11e5d91a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentKind" to schema_36fea325bf1aca70, "pluginOverrides" to schema_6db96506f253ef73, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd0a57f27ae4fccb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9dee5b496693b179, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd0f41825028e154: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("defaultSerial", "devices"), properties = mapOf("defaultSerial" to schema_97d85a5eaee82b97, "devices" to schema_0a18d7dfd6025fad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_cda18ebe4af54c5c: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdc4a9f3587d0382: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c0551fbf082fff0f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_cf7eae9345350df4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("idle"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cff1242509563941: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_2b4ffb830b606cf1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d06f3ce55df8317d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("configured"), JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0762ef7709479bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("day", "totals"), properties = mapOf("day" to schema_bf0b727f7b1c6d07, "totals" to schema_05af39c3e918ff5a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
