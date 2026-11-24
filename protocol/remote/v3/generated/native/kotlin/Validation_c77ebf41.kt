// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_ea7fc856bb9aa12e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"), properties = mapOf("baseBranch" to schema_bf0b727f7b1c6d07, "checksStatus" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "isCrossRepository" to schema_feeb8bb50144d96d, "isDraft" to schema_feeb8bb50144d96d, "mergeStateStatus" to schema_ecf46d016507c672, "mergeable" to schema_05ab37f667d37cfc, "number" to schema_23e05d248383ea40, "reviewDecision" to schema_bf0b727f7b1c6d07, "source" to schema_2e68c47efd6e1f9c, "state" to schema_79fd49e14d0e7e17, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "viewerDidAuthor" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea993e5b2d87f77f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("detected", "forwards"), properties = mapOf("detected" to schema_58c75b9ad5972758, "forwards" to schema_2c93150c89b253f9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaa8e54151cd7fc2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaec87ff9d264913: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_bbc648a6c540c254, "version" to schema_cf69e7793fd482bf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaed3cfbf46d5d81: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github"), JsonPrimitive("gitlab"), JsonPrimitive("forgejo"), JsonPrimitive("gitea"), JsonPrimitive("bitbucket"), JsonPrimitive("azure-devops"), JsonPrimitive("gitcafe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaed5114fa77917e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pinned")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaee1dd372e116d3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKinds", "folders"), properties = mapOf("agentKinds" to schema_0f732b9fceb2c6ac, "folders" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaf8a91849801b20: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "modifiedAtMs" to schema_f696f11685898ba7, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb004d9898978907: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2e344365c844d4fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb074c03321e3c7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "inputDigest", "itemId", "status"), properties = mapOf("body" to schema_e43da4fadbe84794, "inputDigest" to schema_ec221fdc1494d0b1, "itemId" to schema_36fea325bf1aca70, "status" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb12aad2875e1908: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb148d7195a1780a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloaded")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2405f61baf028b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bytesPerSecond", "percent", "total", "transferred", "type"), properties = mapOf("bytesPerSecond" to schema_80c415b6e27c6ebd, "percent" to schema_80c415b6e27c6ebd, "total" to schema_80c415b6e27c6ebd, "transferred" to schema_80c415b6e27c6ebd, "type" to schema_bd136ee4bcce8b07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2798e2ccc8bf65: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5646cf57ff3aebe0, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2d4e479ca92c8f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "pluginName"), properties = mapOf("action" to schema_862e6a81a05c9f92, "pluginName" to schema_84c77ee2ad6c219b), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ebd70a208b453fe1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "starred"), properties = mapOf("kind" to schema_833ef472e7760fae, "starred" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebdf410e6db99e49: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9939fd9aa16e34e6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebe931a38f838083: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "kind", "taskId"), properties = mapOf("category" to schema_6d7393f7506dd1c5, "command" to schema_75adf15ca2f6d249, "description" to schema_bf0b727f7b1c6d07, "kind" to schema_32b2db2eaac8458c, "lastProgressAt" to schema_f696f11685898ba7, "outputAction" to schema_4f399075769723a3, "progress" to schema_dfc3f3726c991dbe, "startedAt" to schema_f696f11685898ba7, "stopAction" to schema_4f399075769723a3, "taskId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebfa6f1c64210a5f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "projectId" to schema_36fea325bf1aca70, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec221fdc1494d0b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[a-f0-9]{64}\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec76fa076d16485a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_eb148d7195a1780a, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecbd7591c9493c90: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("diff"), properties = mapOf("diff" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecc6edb6166acda9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeTabId", "tabs"), properties = mapOf("activeTabId" to schema_2d0b6ec9f2b2decf, "tabs" to schema_bf3a4ed0e5798352), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecde1f3c1f09bdc0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1fb6f9ae5f6d1a02, schema_6f5cce5ce127f97f, schema_e213e5cbde87bf9f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ece1ba6d7edbc0d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("height", "width"), properties = mapOf("height" to schema_1b6b610bba2774d6, "width" to schema_1b6b610bba2774d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecf46d016507c672: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("BEHIND"), JsonPrimitive("BLOCKED"), JsonPrimitive("CLEAN"), JsonPrimitive("DIRTY"), JsonPrimitive("DRAFT"), JsonPrimitive("HAS_HOOKS"), JsonPrimitive("UNKNOWN"), JsonPrimitive("UNSTABLE")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ed137d754271e7b1: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d89acaaa627e4845, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
