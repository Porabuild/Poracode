// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_409712bfaed84392: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_e9e7b28a3dddd9fd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40aab29508fb3256: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("port", "protocol"), properties = mapOf("label" to schema_36fea325bf1aca70, "port" to schema_279eee1efa9da6c8, "protocol" to schema_cb34d50832b1e60d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40f9a6009bf15988: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "operationKey"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "operationKey" to schema_96967a6998f6cab7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41148a177ba98c21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stale")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_412fb1bbf466cf98: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "projectLocation", "threadId"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_413ace8627552254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model", "selections"), properties = mapOf("effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "selections" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4147389dac614b3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency", "estimated", "period"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_bf0b727f7b1c6d07, "estimated" to schema_feeb8bb50144d96d, "period" to schema_776626d20373881d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41be750b567a2144: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reload")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41bff5c7300a37e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("success"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d, "success" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41d0cf68976485ec: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("android"), JsonPrimitive("web")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41ffeb2050e1e71c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deltaX", "deltaY", "kind", "x", "y"), properties = mapOf("deltaX" to schema_80c415b6e27c6ebd, "deltaY" to schema_80c415b6e27c6ebd, "kind" to schema_00ebeb8fef40c2a6, "x" to schema_80c415b6e27c6ebd, "y" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42146530bc4d74c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("manual"), JsonPrimitive("updated"), JsonPrimitive("created")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42293281b655edaa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "clientDeviceId", "expiresAt", "generation", "id", "mode", "platform", "sessionId", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "clientDeviceId" to schema_97d85a5eaee82b97, "expiresAt" to schema_80c415b6e27c6ebd, "generation" to schema_d855999aed5e6438, "id" to schema_d855999aed5e6438, "mode" to schema_a8565e7811b17010, "platform" to schema_61e54b5f6751c7a6, "sessionId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_422b1e8c8be5e2c0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_423ec18ef5ab4596: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "login"), properties = mapOf("avatarUrl" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70, "name" to schema_bf0b727f7b1c6d07, "team" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4244283735615c22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "turnId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_9f20fb68ee791598), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4245351a830ce355: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "methodId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "envKind" to schema_9eed5c4959909cfe, "methodId" to schema_36fea325bf1aca70, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_429303c2d6a42977: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42cbe66f126154fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"), properties = mapOf("accounts" to schema_195974ed118a4217, "aiActions" to schema_62392c6d6ccb4368, "availableAccounts" to schema_2c4b8c74e6940159, "device" to schema_26f96950d20651b3, "generatedAt" to schema_3d06117798bf5171, "identity" to schema_da76232259cbe6bb, "insights" to schema_d1beee40ea84d2e9, "mcps" to schema_8c71be0e7fdf9e1a, "models" to schema_195974ed118a4217, "modes" to schema_195974ed118a4217, "promptHeatmap" to schema_c1094a243b47f83c, "providers" to schema_195974ed118a4217, "recent" to schema_d2af525e07bad7b1, "scope" to schema_b99ee3af304513c2, "skills" to schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes" to schema_3d06117798bf5171, "totals" to schema_22f3597ef077b931), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42dfa7eae97f945c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "releaseWslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431000cfcca50793: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"), properties = mapOf("add" to schema_340c8f8b68b6e2b5, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "remove" to schema_340c8f8b68b6e2b5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4311a74adde583c6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("orientation")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431be1ab7e1b0dc9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_53ceafeed27db1df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43372628accc1dd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_7db74ec55cf0af32, "mimeType" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4348fdb13264571d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "queued"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "queued" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43639d56ca3f1150: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "status"), properties = mapOf("message" to schema_36fea325bf1aca70, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_437e2d5d20b6b495: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checks"), properties = mapOf("checks" to schema_3c115ff749c28304), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4392338ffc80bed7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a399fbc7541223f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43d29f1d5a2e1f23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_2d862d697d08c085), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_441bce375b64f3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_442f4438e0362260: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("replace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_44564cf7f2b953f7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("header", "inputDigest", "itemId", "status"), properties = mapOf("header" to schema_547dd82d60a1e7f9, "inputDigest" to schema_ec221fdc1494d0b1, "itemId" to schema_36fea325bf1aca70, "status" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4492692f82322049: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452106e10ecbebd4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("angle", "kind"), properties = mapOf("angle" to schema_a1221059eae7f5c4, "kind" to schema_6c7cb6fb412178b1), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}
