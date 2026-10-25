// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_fe7522595f5637c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "itemType", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "itemType" to schema_5455d140717a50b3, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_441bce375b64f3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe79d48b8af45e7d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ping")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe7aea0f55ed142e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8b1889f3513fe2b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe8cce293da1b3f5: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_413ace8627552254, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fece443c82df794e: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 30, items = schema_5894304151eb6a79, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fed486f9f6e73521: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_c6b76607f48c889e, schema_ca0c8b8a7fbb7b5d, schema_f04c7b0573aff59c, schema_eb2405f61baf028b, schema_ec76fa076d16485a, schema_d1df243f455504fc), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_feeb8bb50144d96d: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_feff20c88bde0c4c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "value"), properties = mapOf("type" to schema_4311a74adde583c6, "value" to schema_d61b01c8cb5f5718), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

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
