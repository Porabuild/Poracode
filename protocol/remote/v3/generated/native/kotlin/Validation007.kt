// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_9189c3f251645aa9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9199b6e9ea61b83e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "id", "isOutdated", "isResolved"), properties = mapOf("comments" to schema_971eac5c1ec68beb, "id" to schema_bf0b727f7b1c6d07, "isOutdated" to schema_feeb8bb50144d96d, "isResolved" to schema_feeb8bb50144d96d, "line" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91a5d2d349991a6a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cumulative"), JsonPrimitive("per-call")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91b38b813d4e4091: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91dcfb42aac98166: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_0174a8d738e73980, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91e1df4b9542bd01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pullRequests"), properties = mapOf("pullRequests" to schema_55a090c12a60cd7e, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_920e2e5db293bc41: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "conflicting" to schema_feeb8bb50144d96d, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "needsStash" to schema_feeb8bb50144d96d, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashCommit" to schema_bf0b727f7b1c6d07, "stashPreserved" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_922ae6d8b34c9e29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeWorktreePaths", "projectLocation"), properties = mapOf("activeWorktreePaths" to schema_0f732b9fceb2c6ac, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9358a37bbc89d2ef: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github"), JsonPrimitive("gitlab"), JsonPrimitive("bitbucket"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9368b22ce42bb60e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("preferred"), JsonPrimitive("powershell")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_938414fbfa27a773: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capturedAt", "checkpointItemId", "commit", "ref", "threadId"), properties = mapOf("capturedAt" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "commit" to schema_36fea325bf1aca70, "ref" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_939b432562853e88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_93bef3a552bf787e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadIds", "type"), properties = mapOf("threadIds" to schema_39d8d7cbf4384109, "type" to schema_25e47114d380c1fb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93cbcfd8dc76a545: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentValue", "id", "type"), properties = mapOf("category" to schema_bf0b727f7b1c6d07, "currentValue" to schema_feeb8bb50144d96d, "id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "role" to schema_09201de15f15ed50, "type" to schema_2c671d62fd5c98a8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93ea7778107ef974: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "done", "id", "text"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "done" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "text" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_93f8fa8787f246fe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-draft-config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_941a12a3ce0aadca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_3d06117798bf5171), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_949f0ec1c2b67829: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("binary"), JsonPrimitive("too_large"), JsonPrimitive("unsupported"), JsonPrimitive("missing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_94dda13e1cf59dea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contextSize"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_94e04fb40cc1be58: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "path"), properties = mapOf("branch" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_94eb65eacab30b70: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "homePath", "parentPath", "path", "truncated"), properties = mapOf("entries" to schema_5da64eb8d698413e, "homePath" to schema_bf0b727f7b1c6d07, "parentPath" to schema_2d0b6ec9f2b2decf, "path" to schema_bf0b727f7b1c6d07, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_953c573b196de65a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project-relative")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95bca512ea5c155a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"), properties = mapOf("attempt" to schema_3d06117798bf5171, "conclusion" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "event" to schema_bf0b727f7b1c6d07, "headBranch" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "id" to schema_3d06117798bf5171, "jobs" to schema_48de96c42130e156, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "workflowId" to schema_3d06117798bf5171, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_95d0adeb5b1f4c44: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "id", "type"), properties = mapOf("cursorSync" to schema_2cfe911595ad978d, "data" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "type" to schema_d8b225d7de9ceec5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-data-utf16"))
}

internal val schema_95e237e57720296e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent-unavailable"), JsonPrimitive("worktree-unavailable"), JsonPrimitive("duplicate-project-watches")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_962b214fbc91a2f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pairing-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9633843f8b51827f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "routing" to schema_fe73ac6ba621dd72), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_963874114b1e0922: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "projectLocation", "sessionRef", "threadId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9645658cf3b0cbb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_94e04fb40cc1be58, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_965bd4463b1b7307: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("run"), properties = mapOf("mtimeMs" to schema_f696f11685898ba7, "run" to schema_74659b54c1ae64b8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96776c817a074e1f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread"), JsonPrimitive("agentSettings")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96967a6998f6cab7: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 8, maxLength = 110, pattern = "^[A-Za-z0-9._:-]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_96cd458fa9bae303: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-workspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_971eac5c1ec68beb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_839da5c7aa9ba993, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9780f521bc1dee38: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-events"), JsonPrimitive("thread-bytes"), JsonPrimitive("global-events"), JsonPrimitive("global-bytes"), JsonPrimitive("oversize"), JsonPrimitive("age"), JsonPrimitive("degraded"), JsonPrimitive("rebase-dropped"), JsonPrimitive("shutdown"), JsonPrimitive("unclean-epoch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97d27c4efa52f52a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_fb3dd6021c9a98a4, schema_9c44204b656290c2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97d85a5eaee82b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97dee2d4960c1271: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "sandboxMode" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98139abfca5e2eda: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c1d4a9f752e166b1, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98b8d023dd2b5171: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("updatedAt" to schema_36fea325bf1aca70, "windows" to schema_761fff05f8adf459, "wsl" to schema_761fff05f8adf459), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98c9ef3e406d69bf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId", "platform"), properties = mapOf("activityTokens" to schema_b84e449d1a150abf, "alertPreferences" to schema_0534fb6201293569, "appVersion" to schema_36fea325bf1aca70, "deviceId" to schema_212ab189f2321de4, "deviceToken" to schema_36fea325bf1aca70, "platform" to schema_41d0cf68976485ec, "pushToStartToken" to schema_36fea325bf1aca70, "routing" to schema_a90fffdae1680bd2, "webAppBasePath" to schema_25a3e0b2a9eecdfb, "webPushSubscription" to schema_fd8574a70c8187db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.registration.platform-fields"))
}

internal val schema_98d52bd55e800515: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_137445efd1582c7a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98ef330d70f2e681: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "version"), properties = mapOf("data" to schema_ca3d163bab055381, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_995ee3e349270afe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remote-reachable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_996ce1c4e0b82a8b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delta", "itemId", "stream", "threadId", "type"), properties = mapOf("delta" to schema_bf0b727f7b1c6d07, "itemId" to schema_bf0b727f7b1c6d07, "replace" to schema_feeb8bb50144d96d, "stream" to schema_b5c1f44eaf04477b, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_f30731ffd8c57b5c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9980c767412d708b: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 20.0, maximum = 400.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9997128f830ac42e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursor", "generation"), properties = mapOf("cursor" to schema_56aa0e45cbdce0d0, "generation" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_99cf08bb5da33962: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeWebSocketClients", "eventBufferEntries", "lastEventSeq"), properties = mapOf("activeWebSocketClients" to schema_56aa0e45cbdce0d0, "eventBufferEntries" to schema_56aa0e45cbdce0d0, "lastEventSeq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9a8b3412f7d55317: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("webrtc")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b050dd4848ae8c2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_304430ceb5560696, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b83e18a93c4ec45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a799b0e11ed8f6df, "usage" to schema_0fce2ade0199ca1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ba1e93599d271dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("modifiedAtMs", "path", "status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "contentBase64" to schema_bf0b727f7b1c6d07, "hasBom" to schema_feeb8bb50144d96d, "lineEnding" to schema_6d6f1fde7308a250, "modifiedAtMs" to schema_f696f11685898ba7, "path" to schema_bf0b727f7b1c6d07, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bc1c08248602f5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9bdd26dd832b19ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "patch", "projectId"), properties = mapOf("kind" to schema_cbc64d14585e9a92, "patch" to schema_cadb9042bbcd8536, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9be4e34050076f08: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"), properties = mapOf("autoUpdate" to schema_f8b6dd8128e8bfe0, "browserPanel" to schema_f8b6dd8128e8bfe0, "chromeBridge" to schema_f8b6dd8128e8bfe0, "computerUse" to schema_f8b6dd8128e8bfe0, "nativeSecrets" to schema_f8b6dd8128e8bfe0, "osNotifications" to schema_f8b6dd8128e8bfe0, "portForward" to schema_f8b6dd8128e8bfe0, "ssh" to schema_f8b6dd8128e8bfe0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9c01de6b080eca40: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c44204b656290c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "envVar", "key", "label", "options", "type"), properties = mapOf("default" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "envVar" to schema_36fea325bf1aca70, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "options" to schema_d0b10c04efa78c87, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_36b9fe91ec45bcd5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9c8337f42f233534: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("shared"), JsonPrimitive("poracode")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9cb900aa2dda44d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"), properties = mapOf("baseCheckpointItemId" to schema_36fea325bf1aca70, "checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d263023fc1dd3de: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_1c58197f2405018b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9d72555063ba9bd7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("runtime.truncated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_9ec272a8244847ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "label"), properties = mapOf("key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9edd0cfb1cd802d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("abbreviatedOid", "authoredDate", "messageHeadline", "oid"), properties = mapOf("abbreviatedOid" to schema_bf0b727f7b1c6d07, "author" to schema_a99c73e81a312991, "authoredDate" to schema_bf0b727f7b1c6d07, "messageBody" to schema_bf0b727f7b1c6d07, "messageHeadline" to schema_bf0b727f7b1c6d07, "oid" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9eed5c4959909cfe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows"), JsonPrimitive("wsl"), JsonPrimitive("posix")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f0df99b7a4b0249: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_1544bc59ff42b21c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1da8cf549c341e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "baseBranch" to schema_bf0b727f7b1c6d07, "body" to schema_bf0b727f7b1c6d07, "changedFiles" to schema_3d06117798bf5171, "checks" to schema_3c115ff749c28304, "closedAt" to schema_2d0b6ec9f2b2decf, "comments" to schema_971eac5c1ec68beb, "commits" to schema_19cc91cdde8419f3, "createdAt" to schema_bf0b727f7b1c6d07, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "mergedAt" to schema_2d0b6ec9f2b2decf, "mergedBy" to schema_da37aeddd0e606ac, "number" to schema_23e05d248383ea40, "reviews" to schema_1fc25f3569e514e5, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1edfda198d533d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("git-state-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f20fb68ee791598: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f6e05a566c74be3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("heapUsedBytes", "rssBytes", "uptimeSeconds"), properties = mapOf("heapUsedBytes" to schema_56aa0e45cbdce0d0, "rssBytes" to schema_56aa0e45cbdce0d0, "uptimeSeconds" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_a087b069daed224f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destination", "kind", "serverId", "source"), properties = mapOf("destination" to schema_dc99757951407418, "kind" to schema_a77c8545896b4c52, "serverId" to schema_36fea325bf1aca70, "source" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a0f0c9734c246725: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("beforePosition" to schema_56aa0e45cbdce0d0, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "reads" to schema_4659e6d395f41e16, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a11ab76af3bce730: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("inertValues", "kind", "model", "owner", "version"), properties = mapOf("inertValues" to schema_3dd69184dc64b745, "kind" to schema_452e07a326fbbba7, "model" to schema_36fea325bf1aca70, "owner" to schema_a8eb5a0e025da439, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a13200e46be7a2e6: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 255, pattern = "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_a16cb9740d19657e: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 8, items = schema_d6a8cd432c4887c3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a1f40266b6e1acfa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prepare-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a20681cb358b7044: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("project", "pullRequestKeys", "refreshedAt"), properties = mapOf("project" to schema_83470ce63973b6e2, "pullRequestKeys" to schema_0f732b9fceb2c6ac, "refreshedAt" to schema_bf0b727f7b1c6d07, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a26f77dd4ad13e5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("targetPort"), properties = mapOf("targetPort" to schema_279eee1efa9da6c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a399fbc7541223f3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_5ea95607826c2d23, schema_12ca2594dca47145, schema_43372628accc1dd8, schema_0e036ef4dad9c975, schema_849e43bfc063f1bb, schema_501221cdcb9cd48b, schema_1806ffb1da5fcacb), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a39dd0410456fe31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("balance"), properties = mapOf("balance" to schema_80c415b6e27c6ebd, "currency" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "unlimited" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a4457c545e0e0489: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"), properties = mapOf("baseBranch" to schema_bf0b727f7b1c6d07, "checksStatus" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "isDraft" to schema_feeb8bb50144d96d, "mergeStateStatus" to schema_ecf46d016507c672, "mergeable" to schema_05ab37f667d37cfc, "number" to schema_23e05d248383ea40, "reviewDecision" to schema_bf0b727f7b1c6d07, "state" to schema_79fd49e14d0e7e17, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "viewerDidAuthor" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a44865d83be28e9f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_36fea325bf1aca70, schema_80c415b6e27c6ebd), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a467b0ed1c0ea208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "minute"), properties = mapOf("kind" to schema_6f5933af0336650b, "minute" to schema_53f3c1938556e280), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a581e67cd137ad59: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 100.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a59d7f7afd3350b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("description" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tooltipDescription" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5af9fa380f11a11: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 2048, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5b7c88e398574a5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a633f9a256d1d0c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("reason", "seq", "type"), properties = mapOf("reason" to schema_36fea325bf1aca70, "seq" to schema_56aa0e45cbdce0d0, "space" to schema_22c1b4b934fdb197, "type" to schema_d9640543f6c97ed9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a66324f9a46c480b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_3120d80990432c9a, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_a6940e107dbdb450: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fwt"), properties = mapOf("fwt" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6ba34cd39bf30c5: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", defaultValue = JsonPrimitive(true), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6f98c7f485db267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "worktreePaths"), properties = mapOf("detail" to schema_15cae388d0cdd5b6, "projectLocation" to schema_080f9cc154af9e27, "worktreePaths" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a77c8545896b4c52: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a799b0e11ed8f6df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("usage.spent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8b4490d4a4f6745: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("owned"), JsonPrimitive("removed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8dfb6388d9edb75: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pulled", "pushed"), properties = mapOf("pulled" to schema_feeb8bb50144d96d, "pushed" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8eb5a0e025da439: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "presentationMode"), properties = mapOf("agentInstanceId" to schema_36fea325bf1aca70, "agentKind" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a8f9536c8e956810: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2e2f445a742056c6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a90fffdae1680bd2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("clientConnectionId", "desktopId", "version"), properties = mapOf("clientConnectionId" to schema_53996e5a27a5b0c4, "desktopId" to schema_c7e9848de3a346ed, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9266ff57466f267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("versions"), properties = mapOf("versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a93ba7bf23f9b121: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_c7bfc39efc965eed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
