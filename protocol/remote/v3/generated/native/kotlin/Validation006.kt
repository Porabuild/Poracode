// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_56aa0e45cbdce0d0: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56df8e6416f18e3e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56ee97530dcbb64f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5760038b3ac1009b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "patch"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "patch" to schema_2a5c67603fdb726c), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_580efa06e9547a64: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetProjectId"), properties = mapOf("kind" to schema_701d7d6274e152f6, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetProjectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_581f3fd03959d5f7: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 50.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58317133a27c74f8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9c01de6b080eca40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_585d7373f6c647fe: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f82c2aa6f629e6fe, schema_c2b3b7b2742027d9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_587e72c508e2943a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("fork")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5894304151eb6a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("endLine", "path", "side", "startLine", "text"), properties = mapOf("endLine" to schema_23e05d248383ea40, "path" to schema_36fea325bf1aca70, "side" to schema_598c25a2e687258b, "startLine" to schema_23e05d248383ea40, "text" to schema_6d40bf61903aed2d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58a226c992f64fc4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58c75b9ad5972758: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_40aab29508fb3256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58edfaf9f73b8db4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("working"), JsonPrimitive("needs_approval"), JsonPrimitive("needs_reply"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58f9a3fda2694c76: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "hour", "label"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "hour" to schema_47c50d7349a5a322, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59152790354c604a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("guide", "stale", "status"), properties = mapOf("diffHash" to schema_ec221fdc1494d0b1, "guide" to schema_c591e31c389e744f, "stale" to schema_feeb8bb50144d96d, "status" to schema_e25509dad8a191fe), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_591e7e71be40d4d4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_6b98eaede59b512a, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_592634b8956b6cd0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("permission")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59599d21a24ed95c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("beforeId", "id", "threadId"), properties = mapOf("beforeId" to schema_df704162f3d15808, "id" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_595da89b21b7ca56: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38adcf16c79023ce, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_596b826e9125183e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "type"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "type" to schema_d4757acfcddc86a6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_598c25a2e687258b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("LEFT"), JsonPrimitive("RIGHT")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5994d84d0d782ee0: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 6, items = schema_63a5f0fcbab4a3a8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59cd628901920f3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "title"), properties = mapOf("agents" to schema_cbad4936b49ad671, "detail" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a17efba356f5500: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("queued"), JsonPrimitive("running"), JsonPrimitive("done"), JsonPrimitive("failed"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a8607ab9974cf4e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "crews" to schema_91181085efd88304, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a9666a2c52a802f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "audioBase64", "id", "offset"), properties = mapOf("action" to schema_11da754926e41b05, "audioBase64" to schema_684d2eec4cf8a72b, "id" to schema_d855999aed5e6438, "offset" to schema_8cec6a74a97374d7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aa949613e8394ce: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "prompt"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "focus" to schema_feeb8bb50144d96d, "groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_60fc988aefaed4f5, "launchRuntime" to schema_feeb8bb50144d96d, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "title" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aa9e435f68d585e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("transcript")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aba12c8b801732a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "comments", "decision", "expectedHeadSha", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("body" to schema_866aaf9918167eb9, "comments" to schema_0d1cc1ca31f4769d, "decision" to schema_c0551fbf082fff0f, "expectedHeadSha" to schema_ef369ae84db5485c, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_5cddec4454f9cd6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "language", "model", "phase"), properties = mapOf("error" to schema_522013c70826ee65, "id" to schema_d855999aed5e6438, "language" to schema_f4e43b71651c06ad, "model" to schema_8e43cad70cd70de7, "phase" to schema_98f590cc4ee5bfd9, "progress" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5cfe15b2e7d4fc30: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("available"), JsonPrimitive("already-imported"), JsonPrimitive("conflict")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5e585becfdaebc00: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("crew-only"), JsonPrimitive("crew-first")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5f1cf4ab237639a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_835d30ad470a686c, "path" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f2c2d7fde6a3eb1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentVersion", "status"), properties = mapOf("currentVersion" to schema_36fea325bf1aca70, "status" to schema_ffdf9008e6986c48), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f5ea22d1d79751d: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_23e05d248383ea40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f8990d59acdf5a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("arch", "engine", "hostName", "platform", "preparation"), properties = mapOf("arch" to schema_bf0b727f7b1c6d07, "engine" to schema_152c40e616898dd2, "hostName" to schema_bf0b727f7b1c6d07, "platform" to schema_bf0b727f7b1c6d07, "preparation" to schema_52fb827fec8a0504), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5ffdb22692f97bf9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id"), properties = mapOf("action" to schema_c408d3b67402af90, "id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_60a3d8687bc0025b: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 3, items = schema_c33d76cdf9c7d5d7, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6350bebbf3d13115: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 24, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_637f685cb2418b8c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_9ff1236d4782edc7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63814ac53005e683: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation", "threadId"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "ensureRunning" to schema_d2dd3595e1b5e5dc, "initialInstructions" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_63a5f0fcbab4a3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "selection"), properties = mapOf("brief" to schema_ba7dfbe6c754d186, "fallbacks" to schema_60a3d8687bc0025b, "id" to schema_020cad6f356d7c67, "label" to schema_6350bebbf3d13115, "noEdits" to schema_d2dd3595e1b5e5dc, "parallel" to schema_6fb5e1ff4ba2dc63, "selection" to schema_c33d76cdf9c7d5d7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_66504fdb436f3b0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_bd85a52dd25effae, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_665acf486e1a0586: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("branches" to schema_cbe0ba241100dba5, "ghAvailable" to schema_feeb8bb50144d96d, "ref" to schema_83470ce63973b6e2, "refreshedAt" to schema_bf0b727f7b1c6d07, "status" to schema_c1d4a9f752e166b1, "worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_678d084ee287670a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_2363c4dd0a78ce9d, "terminal" to schema_2363c4dd0a78ce9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6801e053c0220116: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("back")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_684d2eec4cf8a72b: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 4, maxLength = 262144, pattern = "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
