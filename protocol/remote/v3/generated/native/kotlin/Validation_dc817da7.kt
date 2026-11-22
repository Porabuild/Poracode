// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

internal val schema_57848d2ae7b0fd17: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 180.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_57bd680f6e04d0bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("basisCount", "bundleBytes", "changedFiles"), properties = mapOf("basisCount" to schema_56aa0e45cbdce0d0, "branch" to schema_36fea325bf1aca70, "bundleBytes" to schema_56aa0e45cbdce0d0, "changedFiles" to schema_56aa0e45cbdce0d0, "head" to schema_4e3a1013cf1d3a58), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_57cb887824dd9c8e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_bbc648a6c540c254, "version" to schema_135f7ef79d6fe306), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_580654e20740047f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "envKind"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "envKind" to schema_9eed5c4959909cfe, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_587e72c508e2943a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("fork")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5894304151eb6a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("endLine", "path", "side", "startLine", "text"), properties = mapOf("endLine" to schema_23e05d248383ea40, "path" to schema_36fea325bf1aca70, "side" to schema_598c25a2e687258b, "startLine" to schema_23e05d248383ea40, "text" to schema_6d40bf61903aed2d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58a226c992f64fc4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58bec5fa6d822c6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delivered", "version"), properties = mapOf("controls" to schema_5017198f5c40bd9f, "delivered" to schema_d2dd3595e1b5e5dc, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58c75b9ad5972758: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_40aab29508fb3256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_58cefff26ad3774a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("flowId"), properties = mapOf("callback" to schema_53db4bb96e351be6, "flowId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_594d4a132e11afee: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "catalogId", "entryName", "reviewDigest"), properties = mapOf("action" to schema_a4b7ae3e0e2c08fd, "catalogId" to schema_d855999aed5e6438, "entryName" to schema_84c77ee2ad6c219b, "reviewDigest" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_598de4be53b3c3ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "deferBodies" to schema_30a537a9343bcdf7, "historyCache" to schema_f67f6cbe63879b24, "historyRevision" to schema_2d20bc896a08a92b, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_598e1d78689cb03b: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("plugin.valid-url"))
}

internal val schema_5994d84d0d782ee0: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 6, items = schema_63a5f0fcbab4a3a8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59cd628901920f3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "title"), properties = mapOf("agents" to schema_cbad4936b49ad671, "detail" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_59d16cc54dbfbd72: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_482c9282715722ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a17efba356f5500: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("queued"), JsonPrimitive("running"), JsonPrimitive("done"), JsonPrimitive("failed"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5a51ebab1f5d6f1a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entry", "name"), properties = mapOf("entry" to schema_52dd882a20f0ac1f, "name" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_5a704f7ccb489059: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message", "scope", "severity"), properties = mapOf("code" to schema_36fea325bf1aca70, "message" to schema_36fea325bf1aca70, "scope" to schema_b414b8c354764ff5, "severity" to schema_b966eed60d2ff4bb, "target" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_5a7fa7d249c6bf30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "source"), properties = mapOf("action" to schema_d296b974b4bbbdf3, "source" to schema_52056f3d09c28e34), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_5b7ea40b417951bc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remove-package")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5b89bc4512a529b5: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("archiveUnusedDays" to schema_d0bd9c5c0fa9bf37, "captureCustomMinutes" to schema_8db449fef3c951c4, "captureEffort" to schema_38d1a07d3b9b1c82, "captureFast" to schema_f8b6dd8128e8bfe0, "captureModel" to schema_38d1a07d3b9b1c82, "captureProvider" to schema_39f6d5287a718cd5, "captureTiming" to schema_b0eed3c52a70f213, "deletePolicy" to schema_b5556f3ec1f82cb8, "dreamCadence" to schema_51fc9e063590d3e3, "dreamEffort" to schema_38d1a07d3b9b1c82, "dreamFast" to schema_f8b6dd8128e8bfe0, "dreamModel" to schema_38d1a07d3b9b1c82, "dreamProvider" to schema_39f6d5287a718cd5, "enabled" to schema_f8b6dd8128e8bfe0, "learning" to schema_a6ba34cd39bf30c5, "sessionTokenBudget" to schema_0579a31094a2b8a7, "skillThreshold" to schema_0013f55d4acc3d55, "suggestSkills" to schema_a6ba34cd39bf30c5, "suppressNative" to schema_f8b6dd8128e8bfe0, "syncEnabled" to schema_a6ba34cd39bf30c5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5d217030abf89f29: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 32, items = schema_0bb586e07b3abfce, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_5d90f428f5eaf4f1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("results"), properties = mapOf("results" to schema_393ee0b9197d6bc7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5d9c5341a06760dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("run" to schema_95bca512ea5c155a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5da64eb8d698413e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d0ecd43b5f1b261a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5da869818be88063: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("height", "width"), properties = mapOf("height" to schema_1b6b610bba2774d6, "hingeAngle" to schema_57848d2ae7b0fd17, "inputUnavailable" to schema_feeb8bb50144d96d, "orientation" to schema_b3ef93117a9f9f95, "screenId" to schema_303343fe11e1bb4f, "supportsHingeAngle" to schema_feeb8bb50144d96d, "width" to schema_1b6b610bba2774d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5db21c63a6df83f9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "pluginName"), properties = mapOf("action" to schema_5b7ea40b417951bc, "pluginName" to schema_84c77ee2ad6c219b), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_5e0b4ff187f93bea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cacheRead", "cacheWrite", "input", "output"), properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "input" to schema_f696f11685898ba7, "output" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e1b33a49482671a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cursor" to schema_36fea325bf1aca70, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "mode" to schema_902ee7904a410968, "order" to schema_42146530bc4d74c4, "projectLimit" to schema_85b777c0c99bbbca, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e3a19fb856f8915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e5498f4efcdaa16: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("git")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e585becfdaebc00: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("crew-only"), JsonPrimitive("crew-first")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5e8c2bfac4c6fcc6: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ea355cedc089732: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("callbackUrl", "flowId", "kind", "scope", "serverId"), properties = mapOf("callbackUrl" to schema_2c6490416fcef343, "flowId" to schema_36fea325bf1aca70, "kind" to schema_7a17f4196c2e709e, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ea91ac05355eb18: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 4194304.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
    RemoteSchema(type = "string", pattern = "^[0-9a-f]{6}\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ffd0d821b1e57a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("preview" to schema_2eb2bd4b48793b85), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5ffdb22692f97bf9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id"), properties = mapOf("action" to schema_c408d3b67402af90, "id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6021714d61c0537e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_862e6a81a05c9f92), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_609b25af4bb3252a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts"), properties = mapOf("accountId" to schema_d855999aed5e6438, "accounts" to schema_a0a701104eab3fdf, "authorization" to schema_6a2d40d38c4527c7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_61b9b3b3c244a2ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("captureTiming", "enabled", "entryCount", "lastDreamAt", "lastDreamSummary", "learning", "pendingCandidates", "suggestionCount", "syncEnabled", "threadMode"), properties = mapOf("captureTiming" to schema_21aabfa8248a23b3, "enabled" to schema_feeb8bb50144d96d, "entryCount" to schema_56aa0e45cbdce0d0, "lastDreamAt" to schema_2d0b6ec9f2b2decf, "lastDreamCounts" to schema_4fbe9bf7e2323309, "lastDreamRunId" to schema_2d0b6ec9f2b2decf, "lastDreamSummary" to schema_2d0b6ec9f2b2decf, "learning" to schema_feeb8bb50144d96d, "pendingCandidates" to schema_56aa0e45cbdce0d0, "suggestionCount" to schema_56aa0e45cbdce0d0, "syncEnabled" to schema_feeb8bb50144d96d, "threadMode" to schema_7d35bc9ac5ba82b5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_61e54b5f6751c7a6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("android")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_61efa8909f32b55e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9ee4a9aa10a4d238, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_6290c0f9d5a1b8b5: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62925923e85a96d9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7583b8d37fafbf18, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_62b62e61531c0036: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_79cc8fd8772975d2, "projectId" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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
