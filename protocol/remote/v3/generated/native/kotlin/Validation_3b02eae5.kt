// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_8fa99a81fa4d20fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("detailsDeferred" to schema_d2dd3595e1b5e5dc, "id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_902ee7904a410968: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("page"), JsonPrimitive("inventory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9040d7586304950d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_9d4f8a22a3e1fa05, schema_0b5555e2ca059ee2, schema_72a4809a8d48dab8, schema_feff20c88bde0c4c, schema_ca98effeead73f13, schema_596b826e9125183e, schema_dfbf83bd7409c8d7, schema_861b7e521ad93c4b, schema_3935a65be87f52c2, schema_14f3c332d545bff0, schema_fd4fd2eb416ae002), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_904af6fabc0dbf35: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_85c1db78d5c7dc29, "team" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9063020a6c5ad8b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("navigate")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9083db8e32ed061a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("release")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9108deb639290751: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "prompt" to schema_bf0b727f7b1c6d07, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91181085efd88304: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 24, items = schema_261c25778789d884, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_913674349845fda9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-transcript"), JsonPrimitive("context-file")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9137d8707520f367: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("displayName", "kind", "name", "runCount"), properties = mapOf("displayName" to schema_bf0b727f7b1c6d07, "kind" to schema_b096158c792e0431, "name" to schema_bf0b727f7b1c6d07, "runCount" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_91766049dfdea029: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("managed"), JsonPrimitive("external"), JsonPrimitive("built-in"), JsonPrimitive("plugin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9189c3f251645aa9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_920e2e5db293bc41: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "conflicting" to schema_feeb8bb50144d96d, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "needsStash" to schema_feeb8bb50144d96d, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashCommit" to schema_bf0b727f7b1c6d07, "stashPreserved" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_921834989f2485e5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("openUrl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_922ae6d8b34c9e29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeWorktreePaths", "projectLocation"), properties = mapOf("activeWorktreePaths" to schema_0f732b9fceb2c6ac, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9262f6553ee2010b: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_fe7522595f5637c3, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_996ce1c4e0b82a8b, schema_cdd89e732d29ca0e, schema_baf4f355dd2fd6ae, schema_7cccbb4b01b446c8, schema_15179deb98a23815, schema_e01133268267ec38, schema_2a107f95a9dcf216, schema_9da23fadb81a50e3, schema_d42bf49d95c024ab), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_929ff57e1355048a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_8d030d3e3d2256ff), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_92ee84dadabef210: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("watch"), properties = mapOf("watch" to schema_55bad6da24b769c6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9352f91f46b90036: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("backgroundTasks" to schema_f5906c75b7204bd5, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "historyProjection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimeItems" to schema_5d3ac76d9a521e1d, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_b37f60804aab420f, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_938eaedae89e4e2f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("problem", "status"), properties = mapOf("problem" to schema_a663eabb01251186, "status" to schema_45cf23babef96be9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_94a8055a7bc1b620: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events", "seq"), properties = mapOf("events" to schema_23b45e35f743c6ce, "seq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_9501e4a8a718d07b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id", "language", "model"), properties = mapOf("action" to schema_236e9131b013f10b, "id" to schema_d855999aed5e6438, "language" to schema_f4e43b71651c06ad, "model" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_953c573b196de65a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project-relative")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_956459f749459347: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("entryType" to schema_8d3732b59a0dd026, "limit" to schema_039b848cf1c1ad6c, "projectLocation" to schema_080f9cc154af9e27, "query" to schema_38d1a07d3b9b1c82, "searchConfig" to schema_cbf78da83a6846d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_9751de90fd8644d6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("key", "label", "totals"), properties = mapOf("key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "totals" to schema_05af39c3e918ff5a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9780f521bc1dee38: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-events"), JsonPrimitive("thread-bytes"), JsonPrimitive("global-events"), JsonPrimitive("global-bytes"), JsonPrimitive("oversize"), JsonPrimitive("age"), JsonPrimitive("degraded"), JsonPrimitive("rebase-dropped"), JsonPrimitive("shutdown"), JsonPrimitive("unclean-epoch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97a2308a409b73af: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("platform", "status"), properties = mapOf("diagnostic" to schema_d3abf2cfac530357, "platform" to schema_61e54b5f6751c7a6, "status" to schema_9ab386636c31e53c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_97a8dc6944322187: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("binary" to schema_c4f6ed0673387892, "npx" to schema_a987d8a0eb988f36, "uvx" to schema_a987d8a0eb988f36), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_980dbd0a7a812034: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[0-9a-f]{64}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98139abfca5e2eda: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c1d4a9f752e166b1, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98473b8b464036a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "cwdExists", "id", "path", "preview", "providerSessionId", "updatedAt"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "cwd" to schema_bf0b727f7b1c6d07, "cwdExists" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "model" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "preview" to schema_bf0b727f7b1c6d07, "providerSessionId" to schema_36fea325bf1aca70, "startedAt" to schema_bf0b727f7b1c6d07, "title" to schema_36fea325bf1aca70, "updatedAt" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98c9ef3e406d69bf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId", "platform"), properties = mapOf("activityTokens" to schema_b84e449d1a150abf, "alertPreferences" to schema_0534fb6201293569, "appVersion" to schema_36fea325bf1aca70, "deviceId" to schema_212ab189f2321de4, "deviceToken" to schema_36fea325bf1aca70, "platform" to schema_41d0cf68976485ec, "pushToStartToken" to schema_36fea325bf1aca70, "routing" to schema_a90fffdae1680bd2, "webAppBasePath" to schema_25a3e0b2a9eecdfb, "webPushSubscription" to schema_fd8574a70c8187db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.registration.platform-fields"))
}
