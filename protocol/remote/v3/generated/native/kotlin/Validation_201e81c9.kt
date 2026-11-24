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

internal val schema_23e05d248383ea40: RemoteSchema by lazy {
    RemoteSchema(type = "integer", maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_242a5ef77d1f8924: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24646463758bb02f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("code"), JsonPrimitive("terminal"), JsonPrimitive("markdown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_2483d5e46783ffd1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command", "failed"), properties = mapOf("command" to schema_a9e19d3c098bb2f4, "durationMs" to schema_f696f11685898ba7, "failed" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24a221c9609f967e: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, pattern = "^[A-Za-z0-9][A-Za-z0-9_.-]*\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_24cb35c8f91ba9a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("files"), properties = mapOf("files" to schema_0abd6180b71e8684), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2504426b5098e866: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "reason", "status"), properties = mapOf("itemId" to schema_36fea325bf1aca70, "reason" to schema_4f3ecdc243b0be72, "status" to schema_fd6258ac6546d705), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
    RemoteSchema(type = "string", pattern = "^\\/(?!\\/)(?:[^?#]*)\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_263fd4191f415e73: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseURL", "credentialConfigured", "custom", "id", "modelIds", "name", "protocol", "removable"), properties = mapOf("baseURL" to schema_088c86edf1b9e904, "credentialConfigured" to schema_feeb8bb50144d96d, "custom" to schema_feeb8bb50144d96d, "id" to schema_2b88aa8e662682aa, "modelIds" to schema_d8c10d781ed40d8c, "name" to schema_dcbc5c3920ad5890, "protocol" to schema_14a995c93889f1e1, "removable" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_273d6c9ed6ba49d8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"), properties = mapOf("conditions" to schema_7476e0bfbec07d05, "inputs" to schema_aa36e30f2962353e, "maxDepth" to schema_7aa755d21efd1447, "maxInputBytes" to schema_bed38fc7e15d070f, "maxItems" to schema_8580fa8375e39340, "maxNodes" to schema_1b1b9bdadcd8934d, "version" to schema_cf69e7793fd482bf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
