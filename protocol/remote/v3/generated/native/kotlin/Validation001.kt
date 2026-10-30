// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_000753aa3ed87d21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_003a95dd16c24c10: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("true"), JsonPrimitive("false")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00675d64d428c3d1: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7dce940bfe881c07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00876431431924e0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 1024, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0093611cbbbd16a0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destinationScope", "marketplace", "marketplaceSkillId"), properties = mapOf("availability" to schema_9c8337f42f233534, "destinationScope" to schema_ac6ea0fc110d7efb, "marketplace" to schema_118f67a0fa6bb27d, "marketplaceSkillId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "replace" to schema_f8b6dd8128e8bfe0, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00b1d6328e3a57b5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deletions", "insertions", "path", "staged", "status"), properties = mapOf("deletions" to schema_3d06117798bf5171, "insertions" to schema_3d06117798bf5171, "oldPath" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "staged" to schema_feeb8bb50144d96d, "status" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_00ebeb8fef40c2a6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("scroll")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_010485e0a27ea254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_5465dd986b32b774, "path" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_012b6b31ad80d567: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoint"), properties = mapOf("checkpoint" to schema_938414fbfa27a773), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0138c350a16e9103: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("create-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_014d2dfae880067a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentFinished", "agentId", "location", "threadId", "transcriptDir"), properties = mapOf("agentFinished" to schema_feeb8bb50144d96d, "agentId" to schema_36fea325bf1aca70, "location" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70, "transcriptDir" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0174a8d738e73980: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "paused"), properties = mapOf("items" to schema_e005a5ac28cf7191, "paused" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_018e665246931443: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status", "tabId"), properties = mapOf("reason" to schema_bf0b727f7b1c6d07, "status" to schema_c1f357f1f88472e8, "tabId" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01baf573c6016ec3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_499c88c1c549e934, schema_7f9f5a0d72de0d9a, schema_f8ba039a2f32fad1, schema_135f7ef79d6fe306, schema_e6cfd13a746cd290), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01e21946e943d3eb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent"), JsonPrimitive("plan"), JsonPrimitive("autopilot")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_01f71c4e26e7ecde: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stdio")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0200f968d21b338b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_020cad6f356d7c67: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[a-z0-9][a-z0-9-]{0,31}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_02179e6a4b6545d5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("defaultBranch", "dispatchable", "inputs", "ref", "triggers", "workflowId"), properties = mapOf("defaultBranch" to schema_bf0b727f7b1c6d07, "dispatchable" to schema_feeb8bb50144d96d, "inputs" to schema_c44733d5a3f1db00, "ref" to schema_bf0b727f7b1c6d07, "triggers" to schema_0f732b9fceb2c6ac, "workflowId" to schema_3d06117798bf5171), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_024bd48f0f66abbd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "remote", "url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "remote" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0288aefad61e0244: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "commit", "isMain", "path"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "commit" to schema_bf0b727f7b1c6d07, "isMain" to schema_feeb8bb50144d96d, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_02f5d10d12c9f077: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "sourceScope"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "sourceScope" to schema_b160fc20dd335dc3), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_02f62ff4e29426df: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8103808258c2d166, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_030ab3973aced8b3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_60a0e6f594cb3154, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_034741cb26a53fe4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("remove")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_039b848cf1c1ad6c: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(50), minimum = 1.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_03b0a880c77f4089: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("watch"), properties = mapOf("watch" to schema_5093c62d05bf0072), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_03fdf2ff7afe440b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("clear-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04569d9eea76ae2b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-wait")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_045e333a691dd990: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "threads"), properties = mapOf("kind" to schema_1f4518886240126e, "record" to schema_1be5ac91cc4357cb, "threads" to schema_07e53f0185035761), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0463d43632698ad7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("refresh_token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0465e7aaae9c70d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("value"), properties = mapOf("group" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "value" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_046f6b1ae10fa4ef: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("new-thread")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04879beede8bfc96: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04b1fc8698583888: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_8ce7154e450128c7, "terminal" to schema_8ce7154e450128c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_04de8f3da1a2ece8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("connectTicket", "forward"), properties = mapOf("connectTicket" to schema_36fea325bf1aca70, "enterPath" to schema_36fea325bf1aca70, "forward" to schema_247ec4acb49e6522), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0534fb6201293569: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sound", "statuses"), properties = mapOf("sound" to schema_feeb8bb50144d96d, "statuses" to schema_72130deafac7a5ba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05812a27bb4846c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05ab37f667d37cfc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("MERGEABLE"), JsonPrimitive("CONFLICTING"), JsonPrimitive("UNKNOWN")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_08f2de57fa2dd65f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "path", "projectLocation"), properties = mapOf("access" to schema_2d29c7255e1cf1b1, "path" to schema_bd85a52dd25effae, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0bd6eab0e269161f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged", "newSourceCommit"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "newSourceCommit" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0bd7710eac491f27: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("core" to schema_bf0b727f7b1c6d07, "details" to schema_bf0b727f7b1c6d07, "diff" to schema_bf0b727f7b1c6d07, "files" to schema_bf0b727f7b1c6d07, "reviewThreads" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0dc750244bb89d0c: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, items = schema_27d9340da4120b27, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

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

internal val schema_0f8ade0d27c19c6c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "location", "name"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_5646cf57ff3aebe0, "icon" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "lastDraftConfig" to schema_2f2654f61b052491, "location" to schema_080f9cc154af9e27, "name" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "scripts" to schema_51d89a5cbbb635e7, "searchSettings" to schema_3ccadafaab48b090, "workspaceId" to schema_bf0b727f7b1c6d07, "worktreeLocation" to schema_7eb7e8f44a304273), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_1168c5b9dd9a5f10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_0f8ade0d27c19c6c, "projects" to schema_77c06377e1bf6e10), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_118f67a0fa6bb27d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills-sh"), JsonPrimitive("skills-directory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_11ada4e73a793b0d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("ambiguous"), JsonPrimitive("skipped_no_turns"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
