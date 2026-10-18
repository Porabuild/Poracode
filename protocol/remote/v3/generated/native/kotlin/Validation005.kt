// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_51fc061b3ecc735c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newLocation", "projectId"), properties = mapOf("newLocation" to schema_080f9cc154af9e27, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_522b0d7f41276332: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hash", "message"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "hash" to schema_bf0b727f7b1c6d07, "message" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5296d6b04d46b630: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4c967d4ed16edbc1, schema_e0da1e0a5e3cd077, schema_a66324f9a46c480b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_536f7d46d82f480f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_2c97b9d429a794cb, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53996e5a27a5b0c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("push.routing.client-connection-id.lowercase"))
}

internal val schema_53ceafeed27db1df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53f3c1938556e280: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 59.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_540ab9236f8c36ab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows"), properties = mapOf("posix" to schema_685dee710cb094fd, "windows" to schema_685dee710cb094fd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5455d140717a50b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user_message"), JsonPrimitive("assistant_message"), JsonPrimitive("reasoning"), JsonPrimitive("plan"), JsonPrimitive("goal"), JsonPrimitive("command_execution"), JsonPrimitive("file_change"), JsonPrimitive("tool_call"), JsonPrimitive("mcp_tool_call"), JsonPrimitive("image_view"), JsonPrimitive("dynamic_tool_call"), JsonPrimitive("web_search"), JsonPrimitive("question_answer"), JsonPrimitive("provider_handoff"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5465dd986b32b774: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_54c83506378cf7c8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_f3c2d2c49187a75b, schema_43d29f1d5a2e1f23), unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.goal.objective.trim"))
}

internal val schema_54e79a700cdcdd03: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("heartbeat")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5513eb6f6fbb46a0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("filePath" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27, "staged" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_551f784ecdbbf2f4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "baseModifiedAtMs", "content", "projectLocation"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_552de755ef856a71: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("already")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_553c5c509350e4e7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_6508684ba659826b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_55a090c12a60cd7e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d9ae4e225fe9170f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_55c4cb32b40db3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.delete-branch.remote-cannot-have-owner"))
}

internal val schema_55ee222c096690dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cols", "rows"), properties = mapOf("cols" to schema_9980c767412d708b, "rows" to schema_1fa1b7f79d80e44d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5604f00f2a788035: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bc731d8f39fdb4bc, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_560a7abcaf51999f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authenticatedServerIds", "kind"), properties = mapOf("authenticatedServerIds" to schema_515482d2104d1efa, "kind" to schema_274e069cdc933ee1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56296b74a9501a6f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("manual"), JsonPrimitive("scheduled"), JsonPrimitive("retry")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5646cf57ff3aebe0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("host", "login"), properties = mapOf("host" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_56a9bf5bf312d537: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "description", "enabled", "folderName", "id", "linked", "mutable", "name", "origin", "providerId", "providerLabel", "rootPath", "scope", "scopeLabel", "skillFilePath", "valid"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "availability" to schema_9c8337f42f233534, "description" to schema_bf0b727f7b1c6d07, "enabled" to schema_feeb8bb50144d96d, "folderName" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "importState" to schema_5cfe15b2e7d4fc30, "invalidReason" to schema_883b3b8a6153aa17, "invocation" to schema_ee6af1c3c62ad32f, "linked" to schema_feeb8bb50144d96d, "mutable" to schema_feeb8bb50144d96d, "name" to schema_36fea325bf1aca70, "origin" to schema_91766049dfdea029, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "portable" to schema_feeb8bb50144d96d, "providerGroupId" to schema_36fea325bf1aca70, "providerGroupLabel" to schema_36fea325bf1aca70, "providerGroupOrder" to schema_3d06117798bf5171, "providerId" to schema_36fea325bf1aca70, "providerLabel" to schema_36fea325bf1aca70, "rootPath" to schema_36fea325bf1aca70, "scope" to schema_ac6ea0fc110d7efb, "scopeLabel" to schema_36fea325bf1aca70, "skillFilePath" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "valid" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_591e7e71be40d4d4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_6b98eaede59b512a, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59599d21a24ed95c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("beforeId", "id", "threadId"), properties = mapOf("beforeId" to schema_df704162f3d15808, "id" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_595da89b21b7ca56: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38adcf16c79023ce, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59cd628901920f3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "title"), properties = mapOf("agents" to schema_cbad4936b49ad671, "detail" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a17efba356f5500: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("queued"), JsonPrimitive("running"), JsonPrimitive("done"), JsonPrimitive("failed"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a8fe22d39b2c89d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "freshness", "ref"), properties = mapOf("data" to schema_a4457c545e0e0489, "details" to schema_9f1da8cf549c341e, "diff" to schema_bf0b727f7b1c6d07, "files" to schema_0abd6180b71e8684, "freshness" to schema_0bd7710eac491f27, "ref" to schema_255898614500bbb9, "reviewThreads" to schema_5de54f0b1df69cc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5aa9e435f68d585e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("transcript")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5bf7479aa21dc587: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events"), properties = mapOf("events" to schema_d8a759ff11f9b49b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5c0012cc6db298ee: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_b01e26e0438140cd, schema_3213f68cbec8daf5, schema_21cd039cb32b3851, schema_1ae7de2180f145f4, schema_2e4d2aaed030369e, schema_c3363423bb669510, schema_80906c6ddc7c6c9e, schema_ebd70a208b453fe1, schema_b79d8f64de4f41bd, schema_09765c7778825d10, schema_431be1ab7e1b0dc9, schema_a93ba7bf23f9b121, schema_370ff0ec0af5649a, schema_2062bc5ac9057c02, schema_efd9410c7543c4c0, schema_69af29ff385f1e03, schema_40c1a284293664e0), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5de54f0b1df69cc9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9199b6e9ea61b83e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5f1cf4ab237639a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_835d30ad470a686c, "path" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f2c2d7fde6a3eb1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentVersion", "status"), properties = mapOf("currentVersion" to schema_36fea325bf1aca70, "status" to schema_ffdf9008e6986c48), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5f5ea22d1d79751d: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_23e05d248383ea40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_60232db9c637a046: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete"), JsonPrimitive("release")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_61fc4b3eaedeba13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_620971ca171eff87: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62392c6d6ccb4368: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bb42560f34ae61e9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_625450aae672e384: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("beforePosition" to schema_56aa0e45cbdce0d0, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_637f685cb2418b8c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_9ff1236d4782edc7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_66846085f373f57f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_000753aa3ed87d21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66d66ce0fd3d9001: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_66ee2eb4eda62117: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ae4a7605815e4393, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6722d6f577d7e3bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"), properties = mapOf("gitState" to schema_4331716fe2cf5702, "gitSummariesByThread" to schema_aca97eda78815baa, "projects" to schema_45dc1a0b166d686a, "projectsNextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "threads" to schema_8e7b49eef8ed965c, "threadsNextCursor" to schema_2d0b6ec9f2b2decf, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_67373e16013c20e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "fingerprint"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "fingerprint" to schema_d3359b6d5db5b90d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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
