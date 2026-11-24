// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_9b9783ff6af74430: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("inputDigest", "itemId"), properties = mapOf("inputDigest" to schema_ec221fdc1494d0b1, "itemId" to schema_85c1db78d5c7dc29), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ba1e93599d271dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bc1c08248602f5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9be4e34050076f08: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"), properties = mapOf("autoUpdate" to schema_f8b6dd8128e8bfe0, "browserPanel" to schema_f8b6dd8128e8bfe0, "chromeBridge" to schema_f8b6dd8128e8bfe0, "computerUse" to schema_f8b6dd8128e8bfe0, "nativeSecrets" to schema_f8b6dd8128e8bfe0, "osNotifications" to schema_f8b6dd8128e8bfe0, "portForward" to schema_f8b6dd8128e8bfe0, "ssh" to schema_f8b6dd8128e8bfe0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9bf3994f2546a7d6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("install")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c01de6b080eca40: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c3b27dde4a10a2d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "type"), properties = mapOf("path" to schema_36fea325bf1aca70, "type" to schema_30397dadf4fa88f8), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9c44204b656290c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "envVar", "key", "label", "options", "type"), properties = mapOf("default" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "envVar" to schema_36fea325bf1aca70, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "options" to schema_d0b10c04efa78c87, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_36b9fe91ec45bcd5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c8337f42f233534: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("shared"), JsonPrimitive("poracode")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ca4aec6d46ade2e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("view"), JsonPrimitive("control")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cb900aa2dda44d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"), properties = mapOf("baseCheckpointItemId" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cc5cbbf927c24c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_ca3d163bab055381, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cce97362cd5b2d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notes", "status"), properties = mapOf("notes" to schema_48c9126ae761103f, "status" to schema_01dc96def3d874de), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d0b458ecda8044b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "text"), properties = mapOf("kind" to schema_6a18d2072710cec2, "lines" to schema_3cdb2ff0de916278, "text" to schema_dfc3f3726c991dbe), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d263023fc1dd3de: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c58197f2405018b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d4f8a22a3e1fa05: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_6f5fd1f7837ee8fe), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9d72555063ba9bd7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("runtime.truncated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d92cfef95052445: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("dataUrl" to schema_2ea26986b7ccb5c4, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9d9cbc9ed0e89822: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c2823e73ee0c1dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9da23fadb81a50e3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "threadId", "type"), properties = mapOf("message" to schema_bf0b727f7b1c6d07, "presentation" to schema_4886facc92937666, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a023928e20a71a47), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9dd9855628dd71ae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("chunkCount", "chunkIndex", "data", "fromCursor", "generation", "processState", "resumeServed", "terminalSize", "toCursor", "version", "watchId"), properties = mapOf("chunkCount" to schema_23e05d248383ea40, "chunkIndex" to schema_56aa0e45cbdce0d0, "data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "resumeServed" to schema_feeb8bb50144d96d, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0, "version" to schema_f8ba039a2f32fad1, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.baseline-chunk-utf16"))
}

internal val schema_9dee5b496693b179: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cdc63841ca583c5b, schema_8ab3ef50febb54d1, schema_0fd7e0ac403d7916), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e169df36e4e41f6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "kind"), properties = mapOf("key" to schema_7df0b39f181cc45b, "kind" to schema_14221269d858a2f5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e2c34c2585a7941: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("native" to schema_e1b186e0802b07d2, "wsl" to schema_e374b6098906e936), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e69a11cc2a84612: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "autoArchiveDoneAfterDays" to schema_56aa0e45cbdce0d0, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "crews" to schema_91181085efd88304, "crossagentHiddenModels" to schema_86d5d72e84423420, "crossagentPausedProviders" to schema_0f732b9fceb2c6ac, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "installedPlugins" to schema_e356e4b5f6808673, "memory" to schema_df5d50a7515a4b30, "prAutomationDefault" to schema_6df05d56a8273d4c, "prCreateMode" to schema_bed2580f4ead331e, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslCrews" to schema_1af2c4430c582e39, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e712b4f87e5beb0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("snapshot")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9e8cac9740f0f3da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agents", "version"), properties = mapOf("agents" to schema_8e2e8bbf081abcf9, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ea58f9bfc61ade7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("light"), JsonPrimitive("dark"), JsonPrimitive("system")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9eaa25e68d8e4cf4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "version", "watchId"), properties = mapOf("threadId" to schema_97d85a5eaee82b97, "type" to schema_9f6b436502c63c75, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ec272a8244847ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "label"), properties = mapOf("key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ec28a7798f0d5fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_6d0b14c439689ee7, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9edd0cfb1cd802d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("abbreviatedOid", "authoredDate", "messageHeadline", "oid"), properties = mapOf("abbreviatedOid" to schema_bf0b727f7b1c6d07, "author" to schema_a99c73e81a312991, "authoredDate" to schema_bf0b727f7b1c6d07, "messageBody" to schema_bf0b727f7b1c6d07, "messageHeadline" to schema_bf0b727f7b1c6d07, "oid" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ee4a9aa10a4d238: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "location", "name"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_5646cf57ff3aebe0, "icon" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "lastDraftConfig" to schema_2f2654f61b052491, "location" to schema_080f9cc154af9e27, "name" to schema_36fea325bf1aca70, "pinnedBranches" to schema_515482d2104d1efa, "pluginOverrides" to schema_6db96506f253ef73, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "scripts" to schema_51d89a5cbbb635e7, "searchSettings" to schema_3ccadafaab48b090, "workspaceId" to schema_bf0b727f7b1c6d07, "worktreeBaseBranch" to schema_36fea325bf1aca70, "worktreeLocation" to schema_7eb7e8f44a304273), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9eed5c4959909cfe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows"), JsonPrimitive("wsl"), JsonPrimitive("posix")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f0df99b7a4b0249: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_1544bc59ff42b21c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1edfda198d533d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("git-state-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f20f1584c5cbc0a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"), properties = mapOf("backgroundTasks" to schema_f5906c75b7204bd5, "batches" to schema_8ab1999da3d8813e, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "kind" to schema_e1a91348d83820fb, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "thread" to schema_b37f60804aab420f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f20fb68ee791598: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f329d4108aed026: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 256, items = schema_4e3a1013cf1d3a58, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f521c8da83e5984: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_96b8d7dbded67d2c, schema_9cce97362cd5b2d5), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f5f978bdfd3d4d9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_3cba112875bf376c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f69a3eb5854c7b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "days", "models", "pricing", "providers", "totals"), properties = mapOf("accounts" to schema_3b1f9447f1bebace, "dayModels" to schema_ebdf410e6db99e49, "dayProviders" to schema_9f5f978bdfd3d4d9, "days" to schema_eed304c45e697ad1, "models" to schema_3b1f9447f1bebace, "pricing" to schema_7f0fc2dd36a6993f, "providers" to schema_3b1f9447f1bebace, "totals" to schema_e0fa095c6a9a1aed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f6b436502c63c75: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-vision-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f6e05a566c74be3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("heapUsedBytes", "rssBytes", "uptimeSeconds"), properties = mapOf("heapUsedBytes" to schema_56aa0e45cbdce0d0, "rssBytes" to schema_56aa0e45cbdce0d0, "uptimeSeconds" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f9b81965a83d13f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"), properties = mapOf("conditions" to schema_7476e0bfbec07d05, "inputs" to schema_aa36e30f2962353e, "maxDepth" to schema_7aa755d21efd1447, "maxInputBytes" to schema_bed38fc7e15d070f, "maxItems" to schema_8580fa8375e39340, "maxNodes" to schema_1b1b9bdadcd8934d, "version" to schema_135f7ef79d6fe306), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9fe1fe9bbcff3ecd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "key", "label", "percent"), properties = mapOf("count" to schema_80c415b6e27c6ebd, "key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "percent" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ff1236d4782edc7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a016251474d39e0d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_a023928e20a71a47: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("warning")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a02c812507215fb8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destinationScope", "mode", "sourcePath"), properties = mapOf("availability" to schema_9c8337f42f233534, "destinationScope" to schema_ac6ea0fc110d7efb, "mode" to schema_aa2d0958d3ec845a, "projectLocation" to schema_080f9cc154af9e27, "replace" to schema_f8b6dd8128e8bfe0, "sourcePath" to schema_36fea325bf1aca70, "sourceProjectLocation" to schema_080f9cc154af9e27, "sourceWslDistro" to schema_36fea325bf1aca70, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a03f50bc643a4820: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("code" to schema_2fbfd962f52fe805, "fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_a016251474d39e0d, "message" to schema_ac157d37d82304b4), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a04ed367065645a0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "models"), properties = mapOf("kind" to schema_18e932ea73363819, "models" to schema_b445f14c3106fc97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a050e4e43216f73b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cron")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a087b069daed224f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destination", "kind", "serverId", "source"), properties = mapOf("destination" to schema_dc99757951407418, "kind" to schema_a77c8545896b4c52, "serverId" to schema_36fea325bf1aca70, "source" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a0a701104eab3fdf: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8a3bbd41df0383c0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a11ab76af3bce730: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("inertValues", "kind", "model", "owner", "version"), properties = mapOf("inertValues" to schema_3dd69184dc64b745, "kind" to schema_452e07a326fbbba7, "model" to schema_36fea325bf1aca70, "owner" to schema_a8eb5a0e025da439, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a1221059eae7f5c4: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 180.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a13200e46be7a2e6: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, pattern = "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}
