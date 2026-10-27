// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_ff05783d57039aa1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("assistant")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff3b9b0284fcd244: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 320, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff495aee3e719fab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("parentItemId", "threadId"), properties = mapOf("parentItemId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff4e0a6efa5fd888: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("grant"), JsonPrimitive("revoke")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffc64b31e09ad873: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffd105e9cca567eb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("history"), properties = mapOf("history" to schema_6227384f8fe3c509), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffdf9008e6986c48: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_fed486f9f6e73521, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
