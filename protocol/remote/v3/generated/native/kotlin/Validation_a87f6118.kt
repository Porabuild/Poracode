// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_11ada4e73a793b0d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("ambiguous"), JsonPrimitive("skipped_no_turns"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11da754926e41b05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("append")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11e04e93bdeaf95b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "agentAccess", "device", "expiresAt", "generation", "id", "threadId", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "agentAccess" to schema_e6bc2fd97be6dec8, "device" to schema_4b43828b172de36c, "expiresAt" to schema_80c415b6e27c6ebd, "generation" to schema_d855999aed5e6438, "id" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11f20430355ec49c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "labels" to schema_0e31d5342d99e6b9, "pr" to schema_ea7fc856bb9aa12e, "repository" to schema_bf0b727f7b1c6d07, "reviewRequested" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12344c6d82d54c6d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_938414fbfa27a773, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12ca2594dca47145: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_15838a9e80c7867f, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12f751ee47b47fbd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_a467b0ed1c0ea208, schema_ac7865b2a567eb07, schema_d1c4cb16ae4c331e, schema_84ccfb83d8334510, schema_0a49efe270718ab9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13324e3fec19e623: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("location", "manifestPath"), properties = mapOf("includeAgentChats" to schema_feeb8bb50144d96d, "location" to schema_080f9cc154af9e27, "manifestPath" to schema_36fea325bf1aca70, "transcriptDir" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_134ccbcdbce97927: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "ok"), properties = mapOf("kind" to schema_9083db8e32ed061a, "ok" to schema_d2dd3595e1b5e5dc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_135288c0feeec2fc: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_a76106fec07f8e2b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_135f7ef79d6fe306: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(3.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1371f7bedcffbc2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_ab5271048956dc05), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_137445efd1582c7a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_66504fdb436f3b0e, schema_8b72b09d5cbe1e7f, schema_8850f6c7f12f8eb8), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_137e14636e0bc235: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7eb7e8f44a304273, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1399799a226dcc71: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_00b1d6328e3a57b5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13c8eaff6d71d8fe: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_8e43cad70cd70de7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13f43aaaf56911fa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser"), JsonPrimitive("crossagents"), JsonPrimitive("chrome"), JsonPrimitive("computer-use"), JsonPrimitive("app-controls")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
