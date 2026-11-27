// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_05feb7407cd8c42f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts"), properties = mapOf("accounts" to schema_26c275b82ebc010d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_06461b14925bc6d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromAgentKind"), properties = mapOf("contextStrategy" to schema_913674349845fda9, "fromAgentKind" to schema_36fea325bf1aca70, "handoffItemId" to schema_36fea325bf1aca70, "previousStatus" to schema_8c61ed237d0ab3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_06735b175e7447d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "url"), properties = mapOf("kind" to schema_3cd19b85f5490a72, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_06f7daf0c185051a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("header", "inputDigest", "itemId", "status"), properties = mapOf("header" to schema_2483d5e46783ffd1, "inputDigest" to schema_ec221fdc1494d0b1, "itemId" to schema_36fea325bf1aca70, "status" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0700d342f3ced655: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_6fefd760083e3b74, "version" to schema_e6cfd13a746cd290), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07862819eb1c2071: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("entryType" to schema_8d3732b59a0dd026, "limit" to schema_039b848cf1c1ad6c, "projectLocation" to schema_080f9cc154af9e27, "provisional" to schema_d2dd3595e1b5e5dc, "query" to schema_38d1a07d3b9b1c82, "searchConfig" to schema_cbf78da83a6846d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_078fcc85154eb644: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("facets", "sessions", "truncated"), properties = mapOf("facets" to schema_eaee1dd372e116d3, "sessions" to schema_f75d628126272292, "superseded" to schema_d2dd3595e1b5e5dc, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07971608588bb2db: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch-result")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07a15b7253b914ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b5e66c2e9667a210, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07b9b9802d46bf6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("query", "version"), properties = mapOf("cursor" to schema_109baa93f8b988b2, "includeArchived" to schema_003a95dd16c24c10, "limit" to schema_581f3fd03959d5f7, "projectId" to schema_76ba6b1ee1436f68, "query" to schema_14377f176c4dfd2a, "version" to schema_8795ea0289d608d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07cc5ea327d0d20d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "day", "intensity"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "day" to schema_bf0b727f7b1c6d07, "intensity" to schema_01baf573c6016ec3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07e53f0185035761: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_26dd48aa90982fbb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_080f9cc154af9e27: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_010485e0a27ea254, schema_fa41f0033e95da89, schema_5f1cf4ab237639a7), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08654ec33ed5db02: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_07cc5ea327d0d20d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_088c86edf1b9e904: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_b426243b004ca830, schema_d91d3ff007d07add), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08b1b30ea3ad7138: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events", "seq"), properties = mapOf("events" to schema_d61b8c82caefd0af, "seq" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08ce03e6077b28a9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("completed"), JsonPrimitive("completed_local_only"), JsonPrimitive("ambiguous"), JsonPrimitive("failed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08eb4244d2d3b53e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09201de15f15ed50: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("model"), JsonPrimitive("effort"), JsonPrimitive("mode"), JsonPrimitive("thinking"), JsonPrimitive("fast"), JsonPrimitive("context")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
