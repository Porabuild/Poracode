// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_98d52bd55e800515: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_137445efd1582c7a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98ef330d70f2e681: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "version"), properties = mapOf("data" to schema_ca3d163bab055381, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_98f590cc4ee5bfd9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("preparing"), JsonPrimitive("done"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9909a6f0ceffadb2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fields", "summary"), properties = mapOf("detail" to schema_7673f46694e3b986, "fields" to schema_ddc83cdddf708141, "summary" to schema_7673f46694e3b986, "title" to schema_7673f46694e3b986), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9939fd9aa16e34e6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("day", "model", "totals"), properties = mapOf("day" to schema_bf0b727f7b1c6d07, "model" to schema_bf0b727f7b1c6d07, "totals" to schema_e0fa095c6a9a1aed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_9a15c840683620a4: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e42ea2046849510b, schema_bf88f4ab17c45df7, schema_0ae85718844e0018), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9a8b3412f7d55317: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("webrtc")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9a9f19f594a18814: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accountId", "action", "pluginName", "serverName"), properties = mapOf("accountId" to schema_d855999aed5e6438, "action" to schema_12d1900fc0e7e57d, "pluginName" to schema_84c77ee2ad6c219b, "serverName" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_9ab386636c31e53c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready"), JsonPrimitive("unsupported_host"), JsonPrimitive("missing_sdk"), JsonPrimitive("missing_xcode"), JsonPrimitive("missing_idb"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9addfc34d28f29dc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser"), JsonPrimitive("chrome"), JsonPrimitive("computer")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b050dd4848ae8c2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_304430ceb5560696, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9b963a4b704c492d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedHeadSha", "prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "expectedHeadSha" to schema_89303c6cbb3ecd9a, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
