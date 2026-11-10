// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_05af39c3e918ff5a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("categories", "categorizedTokens", "estimatedSamples", "estimatedTokens", "estimatedUsd", "observed", "observedSamples", "observedTokens", "tokens", "unpricedTokens"), properties = mapOf("categories" to schema_e70be7a06d8baea6, "categorizedTokens" to schema_56aa0e45cbdce0d0, "estimatedSamples" to schema_56aa0e45cbdce0d0, "estimatedTokens" to schema_56aa0e45cbdce0d0, "estimatedUsd" to schema_f696f11685898ba7, "observed" to schema_c8ef822f0af9edc7, "observedSamples" to schema_56aa0e45cbdce0d0, "observedTokens" to schema_56aa0e45cbdce0d0, "tokens" to schema_56aa0e45cbdce0d0, "unpricedTokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05feb7407cd8c42f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts"), properties = mapOf("accounts" to schema_26c275b82ebc010d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_06461b14925bc6d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromAgentKind"), properties = mapOf("contextStrategy" to schema_913674349845fda9, "fromAgentKind" to schema_36fea325bf1aca70, "handoffItemId" to schema_36fea325bf1aca70, "previousStatus" to schema_8c61ed237d0ab3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_06735b175e7447d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "url"), properties = mapOf("kind" to schema_3cd19b85f5490a72, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_078fcc85154eb644: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("facets", "sessions", "truncated"), properties = mapOf("facets" to schema_eaee1dd372e116d3, "sessions" to schema_f75d628126272292, "superseded" to schema_d2dd3595e1b5e5dc, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07971608588bb2db: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch-result")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07a15b7253b914ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b5e66c2e9667a210, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07b9b9802d46bf6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("query", "version"), properties = mapOf("cursor" to schema_109baa93f8b988b2, "includeArchived" to schema_003a95dd16c24c10, "limit" to schema_581f3fd03959d5f7, "projectId" to schema_76ba6b1ee1436f68, "query" to schema_14377f176c4dfd2a, "version" to schema_8795ea0289d608d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07cc5ea327d0d20d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "day", "intensity"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "day" to schema_bf0b727f7b1c6d07, "intensity" to schema_01baf573c6016ec3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_07e53f0185035761: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_26dd48aa90982fbb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_080f9cc154af9e27: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_010485e0a27ea254, schema_fa41f0033e95da89, schema_5f1cf4ab237639a7), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08654ec33ed5db02: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_07cc5ea327d0d20d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08ce03e6077b28a9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("completed"), JsonPrimitive("completed_local_only"), JsonPrimitive("ambiguous"), JsonPrimitive("failed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08eb4244d2d3b53e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09201de15f15ed50: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("model"), JsonPrimitive("effort"), JsonPrimitive("mode"), JsonPrimitive("thinking"), JsonPrimitive("fast"), JsonPrimitive("context")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0943be33f9e190f8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentDeviceId", "devices"), properties = mapOf("currentDeviceId" to schema_bf0b727f7b1c6d07, "devices" to schema_744f57e3eb025261), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_095b77a7c83a814a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursor", "notices", "reads"), properties = mapOf("afterSeq" to schema_56aa0e45cbdce0d0, "cursor" to schema_bd85a52dd25effae, "maxBytes" to schema_23e05d248383ea40, "maxDecodeBytes" to schema_23e05d248383ea40, "notices" to schema_f67f6cbe63879b24, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_095caa15231b6058: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_281d24bbbaa46745, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09765c7778825d10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "threadIds", "worktreePath"), properties = mapOf("kind" to schema_6a0abedb39fd6f31, "projectId" to schema_36fea325bf1aca70, "threadIds" to schema_0c6254245418ba4c, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09b66dd237e8c823: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseCheckpointItemId", "baseRef", "capturedAt", "changedFiles", "checkpointItemId", "commit", "ref", "threadId"), properties = mapOf("baseCheckpointItemId" to schema_36fea325bf1aca70, "baseRef" to schema_36fea325bf1aca70, "capturedAt" to schema_36fea325bf1aca70, "changedFiles" to schema_5604f00f2a788035, "checkpointItemId" to schema_36fea325bf1aca70, "commit" to schema_36fea325bf1aca70, "ref" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09b78d9c1d4c3a6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId"), properties = mapOf("threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09c88cb14a2765e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09cbc76a2a7d52d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("decision", "prNumber", "projectLocation"), properties = mapOf("body" to schema_38d1a07d3b9b1c82, "decision" to schema_c0551fbf082fff0f, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09f700fdeb3e5213: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_d12ea655163290cc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0a08597c6c22cade: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0a0c8726ed2784f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("category" to schema_bf0b727f7b1c6d07, "controlType" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "role" to schema_09201de15f15ed50, "type" to schema_91b38b813d4e4091), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0a18d7dfd6025fad: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 1, items = schema_19bc3ac82d723fad, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0a49efe270718ab9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expression", "kind", "timeZone"), properties = mapOf("expression" to schema_75bcf0cf295f1752, "kind" to schema_a050e4e43216f73b, "timeZone" to schema_be5d5f9829abefd6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0a5d0a388502828c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label"), properties = mapOf("detail" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0aacda6901eb566b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "language"), properties = mapOf("action" to schema_862e6a81a05c9f92, "language" to schema_f4e43b71651c06ad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0abd6180b71e8684: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_63c18b52ffe65d8d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0ad133ee5894107b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status", "type"), properties = mapOf("status" to schema_018e665246931443, "type" to schema_ab6b873225f5c96a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0b2ba27512e423eb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("control", "kind", "version"), properties = mapOf("control" to schema_9040d7586304950d, "kind" to schema_6eed5e1fa2ae0e54, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_0b5555e2ca059ee2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "value"), properties = mapOf("type" to schema_c5a25a432208abbf, "value" to schema_8e9c16e558778bd4), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_0b7e529d3af3c3cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("size", "stream"), properties = mapOf("size" to schema_ece1ba6d7edbc0d7, "stream" to schema_7a39782ede66b352), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0b938cf4ea78a934: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "branch", "projectLocation", "title"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_38d1a07d3b9b1c82, "branch" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "isDraft" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0bb586e07b3abfce: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("text", "type"), properties = mapOf("text" to schema_866aaf9918167eb9, "type" to schema_3ad514880db80c82), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0bd6eab0e269161f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged", "newSourceCommit"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "newSourceCommit" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0bd7710eac491f27: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("core" to schema_bf0b727f7b1c6d07, "details" to schema_bf0b727f7b1c6d07, "diff" to schema_bf0b727f7b1c6d07, "files" to schema_bf0b727f7b1c6d07, "reviewThreads" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0c44cc7b9e1a20e7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_34a31438349deb0f, schema_2784d64db2258376), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0c5d3d75e4ff2cec: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 100, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_0c6254245418ba4c: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0cd9513af81aeee1: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_58a226c992f64fc4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0cdfc047b0a2e1bb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("swipe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0cf71567208700d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("scope" to schema_be6dbda06af6b811, "wslDistros" to schema_242a5ef77d1f8924), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d1cc1ca31f4769d: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 100, items = schema_2ebee6ffa37983f2, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d1cde2ef9942a8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"), properties = mapOf("add" to schema_5fa67a35ab2d9fef, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "remove" to schema_5fa67a35ab2d9fef), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d39188d7ce690df: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "name", "state"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "startedAt" to schema_bf0b727f7b1c6d07, "state" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d697736dcd0a145: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 349528, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d863fe3501fe68f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_feeb8bb50144d96d, "output" to schema_bf0b727f7b1c6d07, "strategy" to schema_b82b9e494d3a9a40), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0dc750244bb89d0c: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, items = schema_27d9340da4120b27, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
