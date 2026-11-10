// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_f1ccd99fb2bc2c2f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("android-uiautomator-xml"), JsonPrimitive("ios-idb-json")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1deff8504bbc0a3: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f22a438b8392693b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "threadId"), properties = mapOf("name" to schema_9bc1c08248602f5c, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f249cae06596abcd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "position", "text"), properties = mapOf("itemId" to schema_36fea325bf1aca70, "position" to schema_56aa0e45cbdce0d0, "text" to schema_b202a6626ea9d1ee), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f252df24b49da178: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("current", "outcome"), properties = mapOf("current" to schema_f550638b8241897c, "outcome" to schema_41148a177ba98c21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f26d9689fe341b94: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_515482d2104d1efa, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2b9759b60404656: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("force" to schema_feeb8bb50144d96d, "providerIds" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2bb61aa3bb8d258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "optionId"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "optionId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2d54b0f9e07d90a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("old"), JsonPrimitive("new")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2e3da83f3088e10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_04569d9eea76ae2b, "result" to schema_51cc694dc5da9f2a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f30731ffd8c57b5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("content.delta")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f34e1c0e37ed0c00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "projectLocation"), properties = mapOf("addAll" to schema_f8b6dd8128e8bfe0, "message" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "reapplyStashCommit" to schema_bb2e0e6d90c93ccf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f355c9e66a3091a2: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f399af5f8dcf6035: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f3c2d2c49187a75b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "objective"), properties = mapOf("action" to schema_10209383e3295873, "objective" to schema_422b1e8c8be5e2c0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f3d89ffd4842a73f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b92447920382853b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f450768848c5befd: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("boolean"), JsonPrimitive("choice"), JsonPrimitive("environment"), JsonPrimitive("number"), JsonPrimitive("string")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f46da48437a0c164: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0465e7aaae9c70d7, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f48ab668e0f88dac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contextStrategy", "inheritedTurnCount", "threadId", "throughItemId", "title", "version"), properties = mapOf("contextStrategy" to schema_38041bf5caec6644, "inheritedTurnCount" to schema_23e05d248383ea40, "threadId" to schema_36fea325bf1aca70, "throughItemId" to schema_36fea325bf1aca70, "title" to schema_36fea325bf1aca70, "transfer" to schema_cbf87de41a5a2211, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4cab1817a71aa36: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4e43b71651c06ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 32, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f4e52376e9e6b7f8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2583fd799237ae71, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f550638b8241897c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c66f09c6212330ba, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f58a8b771657d037: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f5906c75b7204bd5: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ebe931a38f838083, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f614b14ae0e3bbca: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actionId", "payload", "threadId"), properties = mapOf("actionId" to schema_f355c9e66a3091a2, "payload" to schema_e6958017dac6cd3b, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f67f6cbe63879b24: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f69100925fc0e774: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_f696f11685898ba7: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f6983a322fa14ff5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "projectLocation"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
