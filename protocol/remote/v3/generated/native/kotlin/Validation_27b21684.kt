// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_7ac92dcb7485437b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "task"), properties = mapOf("kind" to schema_1f4518886240126e, "task" to schema_7ab420c1b78efb1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ac95086b2ca282e: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_7b212bbb531a3d31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("doc", "todos", "updatedAt"), properties = mapOf("doc" to schema_6e4ad578250cef79, "todos" to schema_e7c244bd461f7229, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7bbdba78cb64cd5f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_e3fc8b89f137aafe, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7c8fd050dd5e98a8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("Bearer")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7cccbb4b01b446c8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("tasks", "threadId", "type"), properties = mapOf("tasks" to schema_f5906c75b7204bd5, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_2c10059100ccb9e8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ce40fcb9f4c6111: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7d62681c6488867d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7d9e4e8a681070bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceHeight", "deviceWidth", "offsetTop", "pageScaleFactor", "scrollOffsetX", "scrollOffsetY"), properties = mapOf("deviceHeight" to schema_80c415b6e27c6ebd, "deviceWidth" to schema_80c415b6e27c6ebd, "offsetTop" to schema_80c415b6e27c6ebd, "pageScaleFactor" to schema_80c415b6e27c6ebd, "scrollOffsetX" to schema_80c415b6e27c6ebd, "scrollOffsetY" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7db74ec55cf0af32: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("attachment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7dccd2754fedc801: RemoteSchema by lazy {
    RemoteSchema(defaultValue = JsonNull, unionKind = "anyOf", options = listOf(schema_95e237e57720296e, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ded875dbc20840e: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_665acf486e1a0586, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7df0b39f181cc45b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("enter"), JsonPrimitive("backspace"), JsonPrimitive("tab"), JsonPrimitive("escape"), JsonPrimitive("arrow-up"), JsonPrimitive("arrow-down"), JsonPrimitive("arrow-left"), JsonPrimitive("arrow-right")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e2ac4b6482d3bf6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("includeGhCheck" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e386bfca48a8819: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("assistant"), JsonPrimitive("tool")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7e8114c3dda52277: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("daily"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7eb7e8f44a304273: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("basePath" to schema_bf0b727f7b1c6d07, "mode" to schema_953c573b196de65a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ee0d4255fd8c330: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f06acbaf20f8c25: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 2048, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f0fc2dd36a6993f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8ca5860ab0ec6478, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f27390751296eea: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^pc_media_[A-Za-z0-9_-]{43}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f6bd58bd8881ec0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 100000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f836db787c9df87: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[A-Za-z0-9][A-Za-z0-9-]{7,63}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f86e779ad379105: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f88819389c3ccc9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bf61c597568a8798, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7f9f5a0d72de0d9a: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(1.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7fdc1b397391e8f3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0a5d0a388502828c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7fe780499159088a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("done")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80906c6ddc7c6c9e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("done", "kind"), properties = mapOf("done" to schema_feeb8bb50144d96d, "kind" to schema_a9e065ca182491e5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_80a9ff940d24dba8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_3328521e00056564, schema_51f2acb99ea96b5b, schema_483d5aa44fc0eaba, schema_875b3bd94059f8e1, schema_290453f28a433311, schema_82fdb789883e6159, schema_500ee3799383d21f, schema_22c8bcdab9edbc02), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
