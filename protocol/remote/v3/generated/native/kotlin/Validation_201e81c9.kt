// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_2363c4dd0a78ce9d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authenticated"), JsonPrimitive("missing"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2365fa95161a3294: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("forge.host.https"))
}

internal val schema_236d6f96ed0a17bc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("native")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_236e9131b013f10b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("begin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_236f000609716d3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "selection"), properties = mapOf("brief" to schema_ba7dfbe6c754d186, "fallbacks" to schema_60a3d8687bc0025b, "id" to schema_020cad6f356d7c67, "label" to schema_6350bebbf3d13115, "noEdits" to schema_d2dd3595e1b5e5dc, "parallel" to schema_6fb5e1ff4ba2dc63, "selection" to schema_c33d76cdf9c7d5d7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23a1c447c059f0da: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("throughCursor", "version", "watchId"), properties = mapOf("throughCursor" to schema_56aa0e45cbdce0d0, "version" to schema_f8ba039a2f32fad1, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23b45e35f743c6ce: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9262f6553ee2010b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23e05d248383ea40: RemoteSchema by lazy {
    RemoteSchema(type = "integer", maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_242a5ef77d1f8924: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2465ffaaf2ca280d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "totalIndexed"), properties = mapOf("entries" to schema_3615f9310cd4ee9d, "totalIndexed" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2472eab79ad4b307: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("started"), JsonPrimitive("updated"), JsonPrimitive("completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_247ec4acb49e6522: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "listenPort", "targetPort"), properties = mapOf("createdAt" to schema_56aa0e45cbdce0d0, "id" to schema_36fea325bf1aca70, "listenPort" to schema_279eee1efa9da6c8, "targetPort" to schema_279eee1efa9da6c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24a221c9609f967e: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, pattern = "^[A-Za-z0-9][A-Za-z0-9_.-]*$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24cb35c8f91ba9a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("files"), properties = mapOf("files" to schema_0abd6180b71e8684), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2556bf4896893601: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authentication"), JsonPrimitive("tool-restrictions"), JsonPrimitive("sensitive-values")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_255898614500bbb9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostId", "prNumber", "projectId"), properties = mapOf("hostId" to schema_bf0b727f7b1c6d07, "prNumber" to schema_23e05d248383ea40, "projectId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2583fd799237ae71: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_c538d0467addc4ec, schema_4cd2587996458d8d), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25a3e0b2a9eecdfb: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25df6feb29c4a959: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("discoveredAt", "providerSessionId"), properties = mapOf("discoveredAt" to schema_36fea325bf1aca70, "executionIdentity" to schema_97d85a5eaee82b97, "providerSessionId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25e47114d380c1fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-item-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_261c25778789d884: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "lead", "name", "policy", "roles"), properties = mapOf("favorite" to schema_feeb8bb50144d96d, "id" to schema_7d62681c6488867d, "lastUsedAt" to schema_56aa0e45cbdce0d0, "lead" to schema_77f2cf560a042976, "name" to schema_eef7e0a1ed6691c0, "policy" to schema_5e585becfdaebc00, "roles" to schema_d2613d4b01184321, "updatedAt" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_262f4ae53753f0fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("image/jpeg")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26b6bf09ccab2775: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_dc69d1c3f1fc465e, schema_c1a108aae42275ff, schema_02f5d10d12c9f077), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26c275b82ebc010d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bc6c91ba1621863d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26cfea8cde59ada2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("directoryPath" to schema_38d1a07d3b9b1c82, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26dd48aa90982fbb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "projectId", "threadId", "title", "worktreeBranch"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "config" to schema_281d24bbbaa46745, "parentThreadId" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70, "title" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26f96950d20651b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "platform"), properties = mapOf("id" to schema_bf0b727f7b1c6d07, "isCurrent" to schema_feeb8bb50144d96d, "label" to schema_bf0b727f7b1c6d07, "lastActiveAt" to schema_3d06117798bf5171, "platform" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_274e069cdc933ee1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_275476f9b6055811: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repos"), properties = mapOf("repos" to schema_75b702ed8c9f54ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2778fa8937ac1709: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_b7ac3adaa07b7aa4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27790e6c4216ae5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id"), properties = mapOf("action" to schema_482c9282715722ac, "id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2784d64db2258376: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"), properties = mapOf("backgroundTasks" to schema_f5906c75b7204bd5, "batches" to schema_4a5ba059d38b8eac, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "kind" to schema_e1a91348d83820fb, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "thread" to schema_aae5723e41a44bb6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2798cb9d2dca7539: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "result" to schema_6a2d40d38c4527c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_279eee1efa9da6c8: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 65535.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27aa97567424846c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path", "projectId"), properties = mapOf("kind" to schema_88444d52d400622b, "path" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27d9340da4120b27: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("rationale", "threadId"), properties = mapOf("rationale" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280719966e4ed3aa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"), properties = mapOf("maxActiveAgentSessions" to schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers" to schema_56aa0e45cbdce0d0, "maxActiveTerminalShells" to schema_56aa0e45cbdce0d0, "overloadRetryAfterMs" to schema_56aa0e45cbdce0d0, "refuseNewStarts" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280ab70e288f77f7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_38754692c8b5ebef, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_281d24bbbaa46745: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crew" to schema_46a8742e5750f74f, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "importedFrom" to schema_3471186f1398f1d2, "mcpServerOverrides" to schema_6db96506f253ef73, "mode" to schema_01e21946e943d3eb, "model" to schema_36fea325bf1aca70, "pluginOverrides" to schema_6db96506f253ef73, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d, "workflows" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2840caeaedca16a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("thinking"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2843e0996b9986e5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities"), properties = mapOf("capabilities" to schema_9be4e34050076f08), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_285309f050a3f125: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_fff3547caad99f85, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_288cf32acf26654a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("downloadBytes", "id", "installed", "languages", "name", "supportsLanguageDetection", "verified"), properties = mapOf("downloadBytes" to schema_78830b3d6ec86f55, "id" to schema_bf0b727f7b1c6d07, "installed" to schema_feeb8bb50144d96d, "languages" to schema_0f732b9fceb2c6ac, "name" to schema_bf0b727f7b1c6d07, "supportsLanguageDetection" to schema_feeb8bb50144d96d, "verified" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28ab5341451545c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop"), JsonPrimitive("mobile"), JsonPrimitive("tablet"), JsonPrimitive("browser"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28b9eff1da2232c5: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_97d27c4efa52f52a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_290453f28a433311: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId", "url"), properties = mapOf("kind" to schema_9063020a6c5ad8b3, "tabId" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_291e0a286efaf880: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("channel", "previewId", "version"), properties = mapOf("channel" to schema_3c702b70b3eb4220, "previewId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_294ca0c3f20bda2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "httpsUrl" to schema_bf0b727f7b1c6d07, "isFork" to schema_feeb8bb50144d96d, "isPrivate" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "nameWithOwner" to schema_bf0b727f7b1c6d07, "owner" to schema_bf0b727f7b1c6d07, "pushedAt" to schema_bf0b727f7b1c6d07, "sshUrl" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_297655ba91f41fa6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_49834fb5a406b494), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29b52750e42441f8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7e8114c3dda52277, schema_b305c5dcc2d06cc2, schema_f6a941e10f9feb27, schema_38c5e1151393f6bd, schema_3c594c99571d82f9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29fba8fe9f5724e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("auth", "p256dh"), properties = mapOf("auth" to schema_36fea325bf1aca70, "p256dh" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a107f95a9dcf216: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "removedCompletedTurnAnchors", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "removedCompletedTurnAnchors" to schema_0f732b9fceb2c6ac, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_9d72555063ba9bd7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a150cae9967732a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("connectionId", "threadId"), properties = mapOf("connectionId" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a2641f29ae91ad5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("extractedAt", "sourceProvider", "sourceSessionId", "summary"), properties = mapOf("contentKind" to schema_5aa9e435f68d585e, "extractedAt" to schema_36fea325bf1aca70, "sourceProvider" to schema_36fea325bf1aca70, "sourceSessionId" to schema_36fea325bf1aca70, "summary" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a43ea36a62fa6ac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "error", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "error" to schema_5cb704413fbdf0b3, "latencyMs" to schema_56aa0e45cbdce0d0, "status" to schema_fd6258ac6546d705, "toolCount" to schema_499c88c1c549e934), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a5c67603fdb726c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("credentialRef" to schema_c223d7ef6abf4cfd, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "port" to schema_6db9f33ca9aa8b01, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2a65cef1bc5905f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a7c0f630028ad83: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a8bc62fab6ac143: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bootstrapMethods", "policy", "scopes", "sessionMethods"), properties = mapOf("bootstrapMethods" to schema_c8aab5b657a17f5e, "policy" to schema_995ee3e349270afe, "scopes" to schema_515482d2104d1efa, "sessionMethods" to schema_07a15b7253b914ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2ae8d538fe55c35d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_929ff57e1355048a, schema_fee1e07039137fc5, schema_475f45061f4eecab, schema_297655ba91f41fa6, schema_0aacda6901eb566b, schema_f8fde013f784c33d, schema_9501e4a8a718d07b, schema_5a9666a2c52a802f, schema_5ffdb22692f97bf9, schema_313744588ce712ec, schema_27790e6c4216ae5b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b430316258b9c31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "nextCursor"), properties = mapOf("historyProjection" to schema_72a4409660da2b12, "items" to schema_5d3ac76d9a521e1d, "nextCursor" to schema_60e901bdbc3f78cd, "reads" to schema_4659e6d395f41e16, "runtimeNotice" to schema_1468dfe9a2db9c9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
