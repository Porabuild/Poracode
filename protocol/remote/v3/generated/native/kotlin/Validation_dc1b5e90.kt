// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_0dd86a486b36c18a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("one-time-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0dde37d4b96304ba: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 536870912.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0dde9dcedeaf7090: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("staged", "unstaged"), properties = mapOf("staged" to schema_e51d77fd6734b53a, "unstaged" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0de685fcf44d9686: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_bbc648a6c540c254, "version" to schema_f8ba039a2f32fad1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0e5eb227708be551: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("haves", "kind", "threadId", "transferId"), properties = mapOf("haves" to schema_9f329d4108aed026, "kind" to schema_fc6406ea9b9267b2, "threadId" to schema_36fea325bf1aca70, "transferId" to schema_7f836db787c9df87), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e8f58f429bb1135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_225e53f995988ddf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0eb986e669e438e8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_62b62e61531c0036, schema_649f2dd010d75dad, schema_3fc597689b262069, schema_46f2b301a55ee807), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0eddbabb02bde15f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_5ec4130b2f258398, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f2003aeafbcbd0b: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f06b19c7fb38c63d, schema_0d6d6153b8ec8300), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f487f7300be19f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "bundledVersion", "canUninstall", "env", "installed", "supported"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "bundledVersion" to schema_bf0b727f7b1c6d07, "canUninstall" to schema_feeb8bb50144d96d, "env" to schema_2583fd799237ae71, "installed" to schema_feeb8bb50144d96d, "reason" to schema_bf0b727f7b1c6d07, "supported" to schema_feeb8bb50144d96d, "version" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0fd2c621eca5ba93: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_9e69a11cc2a84612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
