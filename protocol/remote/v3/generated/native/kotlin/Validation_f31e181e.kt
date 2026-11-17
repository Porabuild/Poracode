// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_d8b225d7de9ceec5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d92866345cd97821: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "latencyMs" to schema_56aa0e45cbdce0d0, "serverInfo" to schema_820293e02a103abf, "status" to schema_7ce40fcb9f4c6111, "toolCount" to schema_56aa0e45cbdce0d0, "tools" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d92fe09fa7f298ab: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("request.resolved")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d95fd60152159d7a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "prNumber", "projectId"), properties = mapOf("branch" to schema_36fea325bf1aca70, "includeReviewBundle" to schema_feeb8bb50144d96d, "kind" to schema_c975fc7daa5c30b3, "prNumber" to schema_23e05d248383ea40, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9640543f6c97ed9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("resync-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d983c015b3a1ad0b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "projectsNextCursor", "reads"), properties = mapOf("inventoryFrontier" to schema_36fea325bf1aca70, "projects" to schema_61efa8909f32b55e, "projectsNextCursor" to schema_df704162f3d15808, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9b927ff80c17b5c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_280ab70e288f77f7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9ce53289df5afc3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId", "sessionId", "threadId"), properties = mapOf("deviceId" to schema_36fea325bf1aca70, "sessionId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da37aeddd0e606ac: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a99c73e81a312991, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da482300f3faecc5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId", "projectLocation"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da546ba4a0601e6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentId", "label"), properties = mapOf("agentId" to schema_36fea325bf1aca70, "attempt" to schema_56aa0e45cbdce0d0, "chat" to schema_1d8def7ed78e9628, "durationMs" to schema_56aa0e45cbdce0d0, "label" to schema_36fea325bf1aca70, "lastProgressAt" to schema_3d06117798bf5171, "lastToolName" to schema_bf0b727f7b1c6d07, "model" to schema_bf0b727f7b1c6d07, "phaseIndex" to schema_56aa0e45cbdce0d0, "phaseTitle" to schema_bf0b727f7b1c6d07, "promptPreview" to schema_bf0b727f7b1c6d07, "queuedAt" to schema_3d06117798bf5171, "resultPreview" to schema_bf0b727f7b1c6d07, "startedAt" to schema_3d06117798bf5171, "state" to schema_5a17efba356f5500, "tokens" to schema_56aa0e45cbdce0d0, "toolCalls" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da6565103c15b143: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^dwp1_[A-Za-z0-9_-]{43}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da66851500474562: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath", "source"), properties = mapOf("kind" to schema_8793e380887b215f, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da76232259cbe6bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("avatarColor", "handle", "name"), properties = mapOf("avatarColor" to schema_8f8e73cb353005a1, "handle" to schema_485fa06696a88681, "name" to schema_c8709e27df818d5b, "plan" to schema_485fa06696a88681), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da78bdce10e9cf0f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da9e94c933512927: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 50, items = schema_c52c624815ab6ea5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dade9637aede6170: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("seq", "type"), properties = mapOf("epoch" to schema_8e43cad70cd70de7, "seq" to schema_56aa0e45cbdce0d0, "type" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_daefe10db0766411: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authentication"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db8efd22aa031937: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dba220fea45f4f88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "id", "state"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "state" to schema_d2a18aed5ce077b0, "submittedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
