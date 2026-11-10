// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_ee73ccabe697663c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextCursor", "runtimeSummariesByThread", "threads"), properties = mapOf("gitSummariesByThread" to schema_aca97eda78815baa, "inventoryFrontier" to schema_36fea325bf1aca70, "nextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "threads" to schema_d98248ab3a8be49f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee8a6a87417deae2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok", "revision"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eeb5c5f788e7f258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation", "staged"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "staged" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eef64882a7b017fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sessionId", "threadId"), properties = mapOf("sessionId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eef7e0a1ed6691c0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef369ae84db5485c: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[0-9a-f]{7,64}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef49c6f9f5f7ce2b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("closed"), JsonPrimitive("merged"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef7ac92f549d928c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("decision", "prNumber", "projectLocation"), properties = mapOf("body" to schema_38d1a07d3b9b1c82, "decision" to schema_c0551fbf082fff0f, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef917452dcccd356: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("tap")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efc124973b411d28: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("skipped_no_location"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efd9410c7543c4c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetThreadId"), properties = mapOf("kind" to schema_8e7b4d097aa71417, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efedb06a4d7088a5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "name", "options", "required", "type"), properties = mapOf("defaultValue" to schema_1994cc63e450a4bd, "description" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "options" to schema_0f732b9fceb2c6ac, "required" to schema_feeb8bb50144d96d, "type" to schema_f450768848c5befd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f04c7b0573aff59c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_5d5cc3aa0a1f3291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f0c513c0146099c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("publicKey"), properties = mapOf("publicKey" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f0f815c9ec0e3b5a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("small"), JsonPrimitive("standard"), JsonPrimitive("large"), JsonPrimitive("extraLarge")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1261de365f15bea: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = -180.0, maximum = 180.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f145218b6dee66b6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_e527c3ee29cd639b, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f156a9bc12c3639a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1666190cd652261: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 500, items = schema_ad1d9fe8b3eda038, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1a8832c8ce43a2f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4e1c353012bcb7ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1c1581e1729d48e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "seq" to schema_23e05d248383ea40, "space" to schema_22c1b4b934fdb197, "type" to schema_829c74ec0aec2226), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
