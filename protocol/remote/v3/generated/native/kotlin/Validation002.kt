// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_1dbbfc3a2edfde6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("access_token" to schema_36fea325bf1aca70, "path" to schema_84c6a19f87f29012), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1eaf563a1e9fa631: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rank"), JsonPrimitive("stars"), JsonPrimitive("recent"), JsonPrimitive("votes")), defaultValue = JsonPrimitive("rank"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f4518886240126e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("create")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f6ff7bae56a790b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("host"), JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fa1b7f79d80e44d: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 5.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fa3cc731f301caf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events"), properties = mapOf("events" to schema_065c7aecfe46aa20), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fbc0e0d793ae9f1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("context.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fc25f3569e514e5: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_dba220fea45f4f88, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_203e1407dc2d843e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_09b66dd237e8c823, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20b48750f1f97bcf: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_bb3cd72cf9e1b0cc, schema_560a7abcaf51999f, schema_2798cb9d2dca7539, schema_f2e3da83f3088e10, schema_3ac3526f6a2607f3), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_20d706a189398fff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope", "serverId"), properties = mapOf("kind" to schema_4d34acc64dd77a5d, "scope" to schema_dc99757951407418, "serverId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_212ab189f2321de4: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_21c479c8dedbe09d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("checking")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_225e53f995988ddf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_228757711c5e4b37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId"), properties = mapOf("itemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22c8bcdab9edbc02: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_41be750b567a2144, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22f3597ef077b931: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeDays", "currentStreakDays", "goalsSet", "longestStreakDays", "longestTaskMs", "messagesSent", "totalPrompts", "totalThreads"), properties = mapOf("activeDays" to schema_56aa0e45cbdce0d0, "currentStreakDays" to schema_56aa0e45cbdce0d0, "goalsSet" to schema_56aa0e45cbdce0d0, "longestStreakDays" to schema_56aa0e45cbdce0d0, "longestTaskMs" to schema_56aa0e45cbdce0d0, "messagesSent" to schema_56aa0e45cbdce0d0, "totalPrompts" to schema_56aa0e45cbdce0d0, "totalThreads" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_22fb635ee9412c65: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectId"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2363c4dd0a78ce9d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authenticated"), JsonPrimitive("missing"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23e05d248383ea40: RemoteSchema by lazy {
    RemoteSchema(type = "integer", maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_23f29a6ceb7ccc76: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_33b08544c9fc1372, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_257f5640a130bf26: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_03b0262a8a76c7b7, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25a3e0b2a9eecdfb: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25e47114d380c1fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-item-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_26d57a3148ed96e8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_9bb33af2f649fdd1, schema_2b7595c3da8bc0e9, schema_da66851500474562, schema_9bdd26dd832b19ef, schema_27aa97567424846c, schema_37addcca5b32752c), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2798cb9d2dca7539: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "result" to schema_6a2d40d38c4527c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_279eee1efa9da6c8: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 65535.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27aa97567424846c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path", "projectId"), properties = mapOf("kind" to schema_88444d52d400622b, "path" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_294ca0c3f20bda2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "httpsUrl" to schema_bf0b727f7b1c6d07, "isFork" to schema_feeb8bb50144d96d, "isPrivate" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "nameWithOwner" to schema_bf0b727f7b1c6d07, "owner" to schema_bf0b727f7b1c6d07, "pushedAt" to schema_bf0b727f7b1c6d07, "sshUrl" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29fba8fe9f5724e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("auth", "p256dh"), properties = mapOf("auth" to schema_36fea325bf1aca70, "p256dh" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a43ea36a62fa6ac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "error", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "error" to schema_5cb704413fbdf0b3, "latencyMs" to schema_56aa0e45cbdce0d0, "status" to schema_fd6258ac6546d705, "toolCount" to schema_499c88c1c549e934), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2ad366bf61312387: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_936535b2f1c97eac, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b4ffb830b606cf1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_feeb8bb50144d96d, schema_bf0b727f7b1c6d07), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7595c3da8bc0e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath"), properties = mapOf("kind" to schema_1f4518886240126e, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7b34c95b23bb0d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_3f5bcd72f92b6f9f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c0b30d69cd8870d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_75aa7b06238db739, schema_41ffeb2050e1e71c, schema_8906d017ba691d6f, schema_9e169df36e4e41f6), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c21c4a9623808ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind", "task"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_cbc64d14585e9a92, "task" to schema_aa2e4a946a9060bf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c4b8c74e6940159: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9ec272a8244847ff, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c93150c89b253f9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_247ec4acb49e6522, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2cb7b58fd1c2e6ed: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "threads"), properties = mapOf("comments" to schema_971eac5c1ec68beb, "threads" to schema_5de54f0b1df69cc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2cfe911595ad978d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCursor", "generation", "toCursor", "version", "watchId"), properties = mapOf("fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_36fea325bf1aca70, "toCursor" to schema_56aa0e45cbdce0d0, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-range"))
}

internal val schema_2d0b6ec9f2b2decf: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d29c7255e1cf1b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d2a48957e54670a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_55ee222c096690dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d52ff1140653b18: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth"), JsonPrimitive("bearer"), JsonPrimitive("other"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d677fb04187d46b: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf("crossagents" to JsonPrimitive(true))), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d8274eae552cc51: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d862d697d08c085: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pause"), JsonPrimitive("resume"), JsonPrimitive("clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e4d2aaed030369e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "title"), properties = mapOf("kind" to schema_356ae1fc455ec4c8, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e6d7dedeb6dc9a6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "createNew" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f0b42b84f3f48a0: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4dea101cb65656f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fb9be13c54e7688: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("auth-required"), JsonPrimitive("timeout"), JsonPrimitive("command-not-found"), JsonPrimitive("connection-failed"), JsonPrimitive("protocol-error"), JsonPrimitive("invalid-config"), JsonPrimitive("probe-unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3008927746cc013b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1b3dc298a6f3cf15, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_302783bd5327b877: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_f2bb61aa3bb8d258, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30b422e470a61b28: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "workflowId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "ref" to schema_36fea325bf1aca70, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30cc89214bd9dffb: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 50000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_311561bc27718240: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("delta", "itemId", "stream", "threadId", "type"), properties = mapOf("delta" to schema_bf0b727f7b1c6d07, "itemId" to schema_bf0b727f7b1c6d07, "stream" to schema_b5c1f44eaf04477b, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_f30731ffd8c57b5c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3120d80990432c9a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("sse")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3155b0e8649e47af: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd124b21d98c4aa2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32332425ac7e1372: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_fe7522595f5637c3, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_311561bc27718240, schema_cdd89e732d29ca0e, schema_9b83e18a93c4ec45, schema_15179deb98a23815, schema_e01133268267ec38, schema_e9d3d0a9b8562d03, schema_f7a8f7639015cad8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3252cdd51930a222: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("result", "version", "watchId"), properties = mapOf("result" to schema_f030d36eb795786a, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32773ce5899289ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32e268a4ad7c1c3d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forwardId"), properties = mapOf("forwardId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3328521e00056564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_0138c350a16e9103, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_338293a42e7115a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("server"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "server" to schema_c04b1452d18edb3f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_33b08544c9fc1372: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fetchedAt", "providerId", "status", "windows"), properties = mapOf("authenticatedAs" to schema_bf0b727f7b1c6d07, "cost" to schema_4147389dac614b3a, "credits" to schema_a39dd0410456fe31, "error" to schema_bf0b727f7b1c6d07, "fetchedAt" to schema_56aa0e45cbdce0d0, "plan" to schema_bf0b727f7b1c6d07, "providerId" to schema_bf0b727f7b1c6d07, "rateLimitedUntil" to schema_56aa0e45cbdce0d0, "status" to schema_3466b9b69cc5e0cc, "tokens" to schema_36a14ea6cf3d0316, "windows" to schema_dc09cb764665b81c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3466b9b69cc5e0cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ok"), JsonPrimitive("auth-missing"), JsonPrimitive("app-not-running"), JsonPrimitive("rate-limited"), JsonPrimitive("quota-hit"), JsonPrimitive("unsupported"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3512bd687eb85e90: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("before"), JsonPrimitive("after")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_356ae1fc455ec4c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rename")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35889b09eb72e208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "ghAvailable", "status", "worktrees"), properties = mapOf("branches" to schema_d715cb198ae66d56, "ghAvailable" to schema_78c0e367e5120eb3, "status" to schema_98139abfca5e2eda, "worktrees" to schema_694e88722e472029), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3615f9310cd4ee9d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_378174642bf763b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36a14ea6cf3d0316: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "input" to schema_f696f11685898ba7, "output" to schema_f696f11685898ba7, "period" to schema_776626d20373881d, "total" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36b9fe91ec45bcd5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("select")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36fea325bf1aca70: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370ff0ec0af5649a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_375b3978f669c107: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("upsert")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_378174642bf763b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37addcca5b32752c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37eeca9f5377b6e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope"), properties = mapOf("kind" to schema_274e069cdc933ee1, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38462ff398fbe205: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "enabled"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "enabled" to schema_feeb8bb50144d96d, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_384bb6ef598ad698: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38b68e422d630291: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("launch"), JsonPrimitive("always")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38c5e1151393f6bd: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^antigravity:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38d1a07d3b9b1c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive(""), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3994629a32a97c9b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("workflows"), properties = mapOf("workflows" to schema_030ab3973aced8b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39c209cff99afe61: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "branch", "projectLocation", "title"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_38d1a07d3b9b1c82, "branch" to schema_36fea325bf1aca70, "isDraft" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d6579ca7450396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d8d7cbf4384109: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39f0b40d9df37da7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a008e3c404a93c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
