// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_0dd86a486b36c18a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("one-time-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0dde9dcedeaf7090: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("staged", "unstaged"), properties = mapOf("staged" to schema_e51d77fd6734b53a, "unstaged" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e036ef4dad9c975: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "kind", "lineNumber", "path", "side", "staged"), properties = mapOf("body" to schema_36fea325bf1aca70, "kind" to schema_d73ffe960ceccb3f, "lineNumber" to schema_23e05d248383ea40, "path" to schema_36fea325bf1aca70, "side" to schema_f2d54b0f9e07d90a, "staged" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e0641a1330fd7db: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ticket"), properties = mapOf("ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e31d5342d99e6b9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2e20b523bd887c4e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e40f389d72655d0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_83c7c01b4046dd13, schema_de00765ac7659be8, schema_f9b76467f6b16682), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e8f58f429bb1135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_225e53f995988ddf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f602da97fc0ccdf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "threadId"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f732b9fceb2c6ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0fbb6754fb3c4dd0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("languageId", "projectLocation", "sessionId"), properties = mapOf("languageId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "sessionId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0fd7e0ac403d7916: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name"), properties = mapOf("description" to schema_2d0b6ec9f2b2decf, "id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70, "type" to schema_a5b7c88e398574a5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_10209383e3295873: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("edit")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_107db71e1696908a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "watchId"), properties = mapOf("type" to schema_f802abb4a32bbf85, "watchId" to schema_8e43cad70cd70de7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_109baa93f8b988b2: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 1024, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1124eb24dd0748ff: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("changes"), JsonPrimitive("responses")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_113b6f36094df840: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_97d27c4efa52f52a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_114549e732be9b99: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch-baseline-chunk")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_115555b2d2065a65: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("interrupted"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_118f67a0fa6bb27d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills-sh"), JsonPrimitive("skills-directory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
