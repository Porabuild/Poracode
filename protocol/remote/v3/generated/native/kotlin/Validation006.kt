// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_5ae95e3b3c8a9ee1: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 2000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5af10e67b405a136: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "type" to schema_af6b6f72d4304b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5bb2b4a4a0c3c485: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5bbcf9e4750fbaa3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ai-evaluated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5c07f5964567e9f0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 16000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5c6957eaa59e2ae2: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 2000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_5cb1759d88da4b15: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_3cdb2ff0de916278, propertyNames = schema_e847e321fbb6435b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cb704413fbdf0b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_2fb9be13c54e7688, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ce0ae73fb12b141: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cfe15b2e7d4fc30: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("available"), JsonPrimitive("already-imported"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d04b357c40b2734: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"), properties = mapOf("authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "authUsesProviderLogin" to schema_feeb8bb50144d96d, "capabilities" to schema_66496e59a33f7747, "installationSource" to schema_36fea325bf1aca70, "installed" to schema_feeb8bb50144d96d, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationMode" to schema_6508684ba659826b, "providerMetadata" to schema_197c2b8c01d7f4ed, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d3ac76d9a521e1d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8fa99a81fa4d20fb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d401c152e12e715: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemCount"), properties = mapOf("contextUsage" to schema_e47ad2358cf0df53, "itemCount" to schema_56aa0e45cbdce0d0, "latestItemId" to schema_36fea325bf1aca70, "latestItemState" to schema_2472eab79ad4b307, "latestItemType" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d4b39004bf5c532: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 1.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d5cc3aa0a1f3291: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-not-available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d8849075c27ee38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "prune" to schema_f8b6dd8128e8bfe0, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d9c5341a06760dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("run" to schema_95bca512ea5c155a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5da64eb8d698413e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d0ecd43b5f1b261a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e1b33a49482671a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "projectLimit" to schema_85b777c0c99bbbca, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e3a19fb856f8915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e8c2bfac4c6fcc6: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ea95607826c2d23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("content", "kind"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "kind" to schema_3ad514880db80c82), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5eca20bab227fb36: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("generation", "version"), properties = mapOf("generation" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_5ef545d60a0a3a62: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("labels", "truncated"), properties = mapOf("labels" to schema_0e31d5342d99e6b9, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f0a33bcd0eda102: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "prompt"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_77c646d1a00c89a5, "focus" to schema_feeb8bb50144d96d, "groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_60fc988aefaed4f5, "launchRuntime" to schema_feeb8bb50144d96d, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "title" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f1cf4ab237639a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_835d30ad470a686c, "path" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f2c2d7fde6a3eb1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentVersion", "status"), properties = mapOf("currentVersion" to schema_36fea325bf1aca70, "status" to schema_ffdf9008e6986c48), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f5ea22d1d79751d: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_23e05d248383ea40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5fa67a35ab2d9fef: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 25, items = schema_904af6fabc0dbf35, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5fbc9d1e0e62e0cb: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[0-9a-f]{6}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ffd0d821b1e57a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("preview" to schema_2eb2bd4b48793b85), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60232db9c637a046: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete"), JsonPrimitive("release")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_605d108f87f42d25: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("base64", "capturedAt", "height", "id", "mimeType", "version", "width"), properties = mapOf("base64" to schema_0d697736dcd0a145, "capturedAt" to schema_80c415b6e27c6ebd, "height" to schema_c664f13e067b9fbd, "id" to schema_d855999aed5e6438, "mimeType" to schema_262f4ae53753f0fb, "version" to schema_7f9f5a0d72de0d9a, "width" to schema_c664f13e067b9fbd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60708133c8c8f499: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("content", "count", "viewerReacted"), properties = mapOf("content" to schema_7d62681c6488867d, "count" to schema_56aa0e45cbdce0d0, "viewerReacted" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60a0e6f594cb3154: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "path", "state"), properties = mapOf("id" to schema_3d06117798bf5171, "name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "state" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60e901bdbc3f78cd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_56aa0e45cbdce0d0, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60fc988aefaed4f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("start")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_61e54b5f6751c7a6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("android")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_61fc4b3eaedeba13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_620971ca171eff87: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6227384f8fe3c509: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_678b5daa004bbe86, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62392c6d6ccb4368: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bb42560f34ae61e9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_626533cdf183bb99: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_626f8596f7256857: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("archived" to schema_feeb8bb50144d96d, "id" to schema_d855999aed5e6438, "unread" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.run-state"))
}

internal val schema_62c3e7fb25ff5c30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("dataChannel", "transport"), properties = mapOf("dataChannel" to schema_36fea325bf1aca70, "transport" to schema_9a8b3412f7d55317), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_632568cf23c893da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("includeRemote" to schema_a6ba34cd39bf30c5, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6364a5845d631689: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_8d889103a9834b21, schema_b01e26e0438140cd, schema_5f0a33bcd0eda102, schema_21cd039cb32b3851, schema_1ae7de2180f145f4, schema_2e4d2aaed030369e, schema_c3363423bb669510, schema_80906c6ddc7c6c9e, schema_ebd70a208b453fe1, schema_b79d8f64de4f41bd, schema_09765c7778825d10, schema_431be1ab7e1b0dc9, schema_a93ba7bf23f9b121, schema_370ff0ec0af5649a, schema_2062bc5ac9057c02, schema_efd9410c7543c4c0, schema_69af29ff385f1e03, schema_09d9f509bf5fec9e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_637f685cb2418b8c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_9ff1236d4782edc7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63aafd940f769d6f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "connectionId", "offerSdp", "threadId"), properties = mapOf("config" to schema_77c646d1a00c89a5, "connectionId" to schema_d855999aed5e6438, "offerSdp" to schema_e78ddc126c04f09d, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63c18b52ffe65d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "path"), properties = mapOf("additions" to schema_3d06117798bf5171, "deletions" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63cf2bb53100cbd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("header", "question", "selected"), properties = mapOf("customAnswer" to schema_bf0b727f7b1c6d07, "header" to schema_bf0b727f7b1c6d07, "question" to schema_bf0b727f7b1c6d07, "selected" to schema_0cd9513af81aeee1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64570e224963bb89: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-input")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_645d18fd9a611f68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("commit"), JsonPrimitive("pr"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64900cfb16aa539e: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "limit" to schema_85b777c0c99bbbca, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "reads" to schema_4659e6d395f41e16, "summaries" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64ba4037c0af9670: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delivered", "version"), properties = mapOf("controls" to schema_8971fe1e2b13c08e, "delivered" to schema_d2dd3595e1b5e5dc, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64dd00a3a569fc23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("worktreeLocation"), properties = mapOf("reapplyStashCommit" to schema_bb2e0e6d90c93ccf, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_64e71691dcceabd9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "untrackedPaths" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6508684ba659826b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("gui")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65899fb957cb9421: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65955df8384777ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "prompt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_36fea325bf1aca70, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_65e6698fa7640db4: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_38b68e422d630291, "terminal" to schema_38b68e422d630291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66021940878f3abc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6602e9e9c3006d18: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commit", "current", "isRemote", "name"), properties = mapOf("commit" to schema_bf0b727f7b1c6d07, "current" to schema_feeb8bb50144d96d, "isRemote" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_663efde552559e08: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("updatedAt" to schema_36fea325bf1aca70, "windows" to schema_fa6200026d51830f, "wsl" to schema_fa6200026d51830f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66496e59a33f7747: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"), properties = mapOf("agentSettingsDefaults" to schema_cff1242509563941, "approvalPolicies" to schema_6d1b9ceb7012b646, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizeChangeReloadsSession" to schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents" to schema_feeb8bb50144d96d, "contextSizes" to schema_d0b10c04efa78c87, "crossagentMcpRouting" to schema_d1d29954f5424dc9, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_242a5ef77d1f8924, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_88480e7409f5bc30, "liveVoice" to schema_62c3e7fb25ff5c30, "mcpConfigSource" to schema_96776c817a074e1f, "mcpScope" to schema_65e6698fa7640db4, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_b4a8e17084bc4fba, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_6d1b9ceb7012b646, "modes" to schema_429303c2d6a42977, "presentationCapabilities" to schema_0a065ea862058d18, "presentationMode" to schema_c9a954a3af7049b0, "presentationModes" to schema_553c5c509350e4e7, "readsImageAttachmentsFromHost" to schema_feeb8bb50144d96d, "readsPdfAttachmentsFromHost" to schema_feeb8bb50144d96d, "reportsSkillCatalog" to schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_6d1b9ceb7012b646, "settingDefs" to schema_28b9eff1da2232c5, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_a6ba34cd39bf30c5, "supportsOneShot" to schema_feeb8bb50144d96d, "supportsReadOnlyOneShotWorkspace" to schema_feeb8bb50144d96d, "supportsResume" to schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa, "threadTitleCommands" to schema_fe7aea0f55ed142e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66504fdb436f3b0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66846085f373f57f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_000753aa3ed87d21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66d66ce0fd3d9001: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66ee2eb4eda62117: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ae4a7605815e4393, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_67373e16013c20e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "fingerprint"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "fingerprint" to schema_d3359b6d5db5b90d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_677d43553d291527: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "deferBodies" to schema_30a537a9343bcdf7, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_678b5daa004bbe86: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_fe7522595f5637c3, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_996ce1c4e0b82a8b, schema_cdd89e732d29ca0e, schema_c60cb0b0f4cbc0eb, schema_7bc7b4d15b02f31d, schema_15179deb98a23815, schema_e01133268267ec38, schema_2a107f95a9dcf216, schema_9da23fadb81a50e3, schema_f7a8f7639015cad8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_678d084ee287670a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_2363c4dd0a78ce9d, "terminal" to schema_2363c4dd0a78ce9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6801e053c0220116: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("back")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_685dee710cb094fd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("args", "binary"), properties = mapOf("args" to schema_0f732b9fceb2c6ac, "binary" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_687b136989a8deb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_08f2de57fa2dd65f, schema_47a6c9970249e96b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6900ba2bd97d76fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "sourceBranchOverride" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_694e88722e472029: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd357f47aa772b6a, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_696917027581de46: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("deviceType" to schema_28ab5341451545c8, "label" to schema_36fea325bf1aca70, "os" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_69af29ff385f1e03: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_69f5ba498bd960ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("item"), properties = mapOf("item" to schema_4c1171296b6868a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a0abedb39fd6f31: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete-worktree-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a0c18e639dbb000: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a2600edfb55d776: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a2d40d38c4527c7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_47fd370c6dedf4fa, schema_89a32138dca165c4, schema_43639d56ca3f1150), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6a8ee4e736a740c4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "copyIgnoredPatterns" to schema_0f732b9fceb2c6ac, "createBranch" to schema_f8b6dd8128e8bfe0, "keepChangesInSource" to schema_f8b6dd8128e8bfe0, "ownerToken" to schema_8e43cad70cd70de7, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "sourceBranch" to schema_9bc1c08248602f5c, "startPoint" to schema_bf0b727f7b1c6d07, "transferUncommitted" to schema_f8b6dd8128e8bfe0, "worktreeOmitRepoDir" to schema_feeb8bb50144d96d, "worktreeRoot" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.add-worktree.frozen-source"))
}

internal val schema_6b3ef80f7d149206: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectScoped", "runtime"), properties = mapOf("projectScoped" to schema_feeb8bb50144d96d, "runtime" to schema_1f6ff7bae56a790b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6b97469fe43177d6: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_6602e9e9c3006d18, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6b98eaede59b512a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("project-pull-requests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6bb6e13415c8cbba: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6bea80c666a89338: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("backgroundTasks" to schema_00675d64d428c3d1, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "historyProjection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimeItems" to schema_5d3ac76d9a521e1d, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_131fd1869b52ef74, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c203f8f04d76313: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 128, items = schema_4b43828b172de36c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c24d6b835735b69: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_fc49e8b0b6ac2911, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c5abb4203cd5fd7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("files", "storage"), properties = mapOf("currentFiles" to schema_739ef5b32c1ac983, "diffHash" to schema_ec221fdc1494d0b1, "files" to schema_739ef5b32c1ac983, "storage" to schema_ae682752b1c14d17), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6c6fca70506b8f43: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data"), properties = mapOf("data" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ccb3f9f839a5656: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_63cf2bb53100cbd8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6cf695d23ae995e6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("interval")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d1b9ceb7012b646: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_a59d7f7afd3350b1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d3a7935eccd662a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs", "schedules", "unreadCount"), properties = mapOf("runs" to schema_280ab70e288f77f7, "schedules" to schema_bc6010db82e83d09, "unreadCount" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d40bf61903aed2d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 32000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d5eecaeceee62b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runtime"), properties = mapOf("runtime" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6d6f1fde7308a250: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("lf"), JsonPrimitive("crlf")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6da82c72b226f41d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("gap", "notice"), properties = mapOf("gap" to schema_f550638b8241897c, "notice" to schema_214ae58e6e08f2d4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6db96506f253ef73: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6db9f33ca9aa8b01: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_279eee1efa9da6c8, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6ddf4b7dc1e0e9e2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("frameId", "kind", "x", "y"), properties = mapOf("frameId" to schema_d855999aed5e6438, "kind" to schema_ef917452dcccd356, "x" to schema_5d4b39004bf5c532, "y" to schema_5d4b39004bf5c532), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_6de1ff82938123c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newContent", "oldContent"), properties = mapOf("newContent" to schema_bf0b727f7b1c6d07, "oldContent" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6df05d56a8273d4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("off"), JsonPrimitive("fix"), JsonPrimitive("merge")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6df40201d8c95128: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bc92ea89e2de4f6a, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6e4ad578250cef79: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ca3d163bab055381, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6eed5e1fa2ae0e54: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("control")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
