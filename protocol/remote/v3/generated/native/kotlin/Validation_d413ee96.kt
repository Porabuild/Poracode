// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_6f5cce5ce127f97f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("observedFingerprint", "state"), properties = mapOf("observedFingerprint" to schema_d3359b6d5db5b90d, "state" to schema_f6c555fb5f1777c9), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_6f5fd1f7837ee8fe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("read")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6fb5e1ff4ba2dc63: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 4.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_6fcb1a55c059e655: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), defaultValue = JsonPrimitive("steer"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_700ee4302bb616f0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environments"), properties = mapOf("environments" to schema_e4ed0fc98f59d7f1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_701d7d6274e152f6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reorder")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7053ed3816efd9d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("version" to schema_bf4561eb7adf4d72), additionalSchema = schema_ca3d163bab055381, unknownPolicy = RemoteUnknownFieldPolicy.PASSTHROUGH)
}

internal val schema_70dc157e5476457b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "days", "models", "pricing", "providers", "totals"), properties = mapOf("accounts" to schema_2c09020b157316f2, "days" to schema_d37d1e49b0be87f8, "models" to schema_2c09020b157316f2, "pricing" to schema_7f0fc2dd36a6993f, "providers" to schema_2c09020b157316f2, "totals" to schema_05af39c3e918ff5a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_70e5b904af7932c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("worktrees"), properties = mapOf("worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_710b6ecb781e06cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "resolution", "usage"), properties = mapOf("gitProcesses" to schema_f80bf20556c43632, "policy" to schema_280719966e4ed3aa, "resolution" to schema_c0edab91e2f5d96e, "usage" to schema_1618be77eba1d732), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_711e84b2a6817609: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("reviewers", "truncated"), properties = mapOf("reviewers" to schema_1d261f6c634ca0b3, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_71cebf47ab9ae231: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("backgroundTasks" to schema_f5906c75b7204bd5, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "historyProjection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "runtimeItems" to schema_5d3ac76d9a521e1d, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_aae5723e41a44bb6, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72130deafac7a5ba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("done", "error", "needsAttention"), properties = mapOf("done" to schema_feeb8bb50144d96d, "error" to schema_feeb8bb50144d96d, "needsAttention" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72373308389f2027: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("merge"), JsonPrimitive("squash"), JsonPrimitive("rebase")), defaultValue = JsonPrimitive("merge"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72429c4be55ff8fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_725be166aa92607b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostId", "projectId"), properties = mapOf("hostId" to schema_bf0b727f7b1c6d07, "projectId" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_729d8ec2243ca0f3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_cbf9eddea4280dec, schema_938eaedae89e4e2f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72a4409660da2b12: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("details-v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_72a4809a8d48dab8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "value"), properties = mapOf("type" to schema_c8c48a1118d06f0b, "value" to schema_f0f815c9ec0e3b5a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_72ce7899de7d8b9d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enterPath"), properties = mapOf("enterPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7324613e41acced2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("argumentHint" to schema_bf0b727f7b1c6d07, "description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "pluginId" to schema_36fea325bf1aca70, "pluginName" to schema_36fea325bf1aca70, "section" to schema_f4cab1817a71aa36, "skillInvocation" to schema_36fea325bf1aca70, "skillName" to schema_36fea325bf1aca70, "skillPath" to schema_36fea325bf1aca70, "skillProvider" to schema_36fea325bf1aca70, "skillScope" to schema_ac6ea0fc110d7efb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_739ef5b32c1ac983: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_cac7783fa7c0ea01, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_740c7dc82a88634a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-watch-baseline-ack")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_744f57e3eb025261: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_26f96950d20651b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_745963f66484f8a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_c1d4a9f752e166b1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74659b54c1ae64b8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f9da03570b6c69fa, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74839ee2e9eafd92: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_b796dbfba5908fbc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_74b3a4e21747a253: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_d3abf2cfac530357, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_757b67af108cc67a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_bd85a52dd25effae), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7583b8d37fafbf18: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("win32"), JsonPrimitive("darwin"), JsonPrimitive("linux")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75aa7b06238db739: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "x", "y"), properties = mapOf("kind" to schema_ef917452dcccd356, "x" to schema_80c415b6e27c6ebd, "y" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75adf15ca2f6d249: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 16384, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75b702ed8c9f54ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_294ca0c3f20bda2e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_75bcf0cf295f1752: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.cron", "string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_75fa28583d2c03c2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("findings"), JsonPrimitive("no-findings"), JsonPrimitive("changed-files"), JsonPrimitive("needs-attention"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7611350a61fc2c31: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("updateModelContext")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_763e82793f2a210a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "connectionId", "offerSdp", "threadId"), properties = mapOf("config" to schema_281d24bbbaa46745, "connectionId" to schema_d855999aed5e6438, "offerSdp" to schema_e78ddc126c04f09d, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7675a7cd6ae22dbd: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_d68bbd085678f807, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_76767b687c50a873: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("adapterKind", "id", "installKind", "installedAt", "name", "version"), properties = mapOf("adapterKind" to schema_36fea325bf1aca70, "icon" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "installKind" to schema_e5d4267d1db7cbbf, "installations" to schema_9e2c34c2585a7941, "installedAt" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_769c50c6909920b7: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 50000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_76b2c94b29aad9b1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_06735b175e7447d5, schema_f97770a7e3ba8e29), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_76ba6b1ee1436f68: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 200, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7738b69937d794b0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_97d85a5eaee82b97, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_776626d20373881d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("today"), JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("cycle")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_77a7dec7edfc464f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("exact"), JsonPrimitive("suspect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_77bd08fa0d0c9544: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "agentAccess", "deviceId", "generation", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "agentAccess" to schema_e6bc2fd97be6dec8, "deviceId" to schema_97d85a5eaee82b97, "generation" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_77c71c73158736b6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_482c9282715722ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_77f2cf560a042976: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "model"), properties = mapOf("agentKind" to schema_8e43cad70cd70de7, "contextSize" to schema_7d62681c6488867d, "effort" to schema_7d62681c6488867d, "fast" to schema_feeb8bb50144d96d, "model" to schema_97d85a5eaee82b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78830b3d6ec86f55: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_80c415b6e27c6ebd, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78a16ea62277e780: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("preserveLocalChanges" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78c0e367e5120eb3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_feeb8bb50144d96d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_78ecc0eb2955fb7f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_46c9cbbd3df64c2a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_79608b5eceb792fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7978d152fa09ea8e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8f483f0889171da1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_79cc8fd8772975d2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_79fd49e14d0e7e17: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("open"), JsonPrimitive("draft"), JsonPrimitive("merged"), JsonPrimitive("closed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a00457b3e3294c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("flowId", "kind", "scope"), properties = mapOf("flowId" to schema_36fea325bf1aca70, "kind" to schema_04569d9eea76ae2b, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a20e2f82d6f16d6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ee6af1c3c62ad32f, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a39782ede66b352: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("transport"), properties = mapOf("transport" to schema_e37012a6e5cb600d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7a4831c3c01cfb91: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("canGoBack", "canGoForward", "loading", "tabId", "title", "url"), properties = mapOf("canGoBack" to schema_feeb8bb50144d96d, "canGoForward" to schema_feeb8bb50144d96d, "faviconUrl" to schema_bf0b727f7b1c6d07, "loading" to schema_feeb8bb50144d96d, "tabId" to schema_36fea325bf1aca70, "title" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_7ab420c1b78efb1d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "enabled", "name", "prompt", "recurrence"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "automation" to schema_fdddba9ec6ce269e, "config" to schema_f69100925fc0e774, "enabled" to schema_feeb8bb50144d96d, "name" to schema_b89c357946c21293, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_12f751ee47b47fbd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
