// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_36ba3d858bc826c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "patch", "projectId"), properties = mapOf("kind" to schema_cbc64d14585e9a92, "patch" to schema_80fe2d5ae5950377, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36ca2b1ea64910b4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "threads"), properties = mapOf("comments" to schema_ac3d09b5c7f361d2, "threads" to schema_7f88819389c3ccc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36ebafd43b47829a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b4441316f1aafac9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36fea325bf1aca70: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370ff0ec0af5649a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3732eed893106b96: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("url"), properties = mapOf("url" to schema_7f06acbaf20f8c25), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_375b3978f669c107: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("upsert")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_378174642bf763b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37addcca5b32752c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37c5f2164832811e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("byteLength", "kind", "sha256", "summary", "transferId"), properties = mapOf("byteLength" to schema_0dde37d4b96304ba, "kind" to schema_fc6406ea9b9267b2, "sha256" to schema_980dbd0a7a812034, "summary" to schema_52895aaaf2e8a0f2, "transferId" to schema_7f836db787c9df87), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37eeca9f5377b6e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope"), properties = mapOf("kind" to schema_274e069cdc933ee1, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38041bf5caec6644: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("transcript")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38462ff398fbe205: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "enabled"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "enabled" to schema_feeb8bb50144d96d, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_384bb6ef598ad698: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38754692c8b5ebef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"), properties = mapOf("attempt" to schema_23e05d248383ea40, "automationSnapshot" to schema_fdddba9ec6ce269e, "completedAt" to schema_595da89b21b7ca56, "error" to schema_2d0b6ec9f2b2decf, "id" to schema_d855999aed5e6438, "iteration" to schema_23e05d248383ea40, "result" to schema_66ee2eb4eda62117, "scheduleId" to schema_d855999aed5e6438, "scheduledFor" to schema_38adcf16c79023ce, "startedAt" to schema_38adcf16c79023ce, "status" to schema_2151c8edcffb30bf, "summary" to schema_2d0b6ec9f2b2decf, "threadId" to schema_36fea325bf1aca70, "trigger" to schema_56296b74a9501a6f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3897f50212cb0b25: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "omittedRuntimeThreadIds" to schema_515482d2104d1efa, "seq" to schema_23e05d248383ea40, "space" to schema_22c1b4b934fdb197, "type" to schema_1aa020e871f1c07e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38adcf16c79023ce: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format = "date-time", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38b68e422d630291: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("launch"), JsonPrimitive("always")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38c5e1151393f6bd: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^antigravity:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38d1a07d3b9b1c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive(""), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38efdc386b3577e7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("uploading"), JsonPrimitive("preparing"), JsonPrimitive("loading"), JsonPrimitive("transcribing"), JsonPrimitive("done")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3935a65be87f52c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("type" to schema_921834989f2485e5, "url" to schema_c1504401bd291fd1), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_3958c7beb695f0ca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ea7fc856bb9aa12e, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3975ceeb3762f594: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version", "watchId"), properties = mapOf("maxChunkBytes" to schema_f58a8b771657d037, "maxWindowBytes" to schema_f58a8b771657d037, "resume" to schema_9997128f830ac42e, "version" to schema_23e05d248383ea40, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_398001902e262d65: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "phase"), properties = mapOf("id" to schema_d855999aed5e6438, "phase" to schema_38efdc386b3577e7, "progress" to schema_a581e67cd137ad59, "transcript" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3994629a32a97c9b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("workflows"), properties = mapOf("workflows" to schema_030ab3973aced8b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_399c72fc193f1510: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expectedRevision", "legacyConnectionId"), properties = mapOf("expectedRevision" to schema_f58a8b771657d037, "legacyConnectionId" to schema_d855999aed5e6438), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_39a57fc9a7427f91: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "config" to schema_f69100925fc0e774, "headBranch" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_39bc2baf33179ca7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("grantType"), properties = mapOf("client" to schema_696917027581de46, "credential" to schema_36fea325bf1aca70, "grantType" to schema_20b56c9f2266c25a, "refreshToken" to schema_36fea325bf1aca70, "scopes" to schema_7978d152fa09ea8e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39c209cff99afe61: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "branch", "projectLocation", "title"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_38d1a07d3b9b1c82, "branch" to schema_36fea325bf1aca70, "isDraft" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
