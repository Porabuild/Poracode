// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_c7d6a559534154dd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repository"), properties = mapOf("repository" to schema_2e5ddb0a3afed2cb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c7e9848de3a346ed: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.routing.identifier-no-controls"))
}

internal val schema_c8425979fd5d4887: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forbidden"), JsonPrimitive("not-found"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8709e27df818d5b: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 80, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8aab5b657a17f5e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0dd86a486b36c18a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8c48a1118d06f0b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("textSize")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c8ef822f0af9edc7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ad6bb2de51c0e05f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c975fc7daa5c30b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pull-request")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c9a954a3af7049b0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("gui")), defaultValue = JsonPrimitive("terminal"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca0c8b8a7fbb7b5d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_518b8374aca2de65, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca3d163bab055381: RemoteSchema by lazy {
    RemoteSchema(unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca5f8d6782ca9f6b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_2d0b6ec9f2b2decf, "processState" to schema_f156a9bc12c3639a, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca8d08ed24dcae50: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "indexing", "nextCursor", "version"), properties = mapOf("entries" to schema_da9e94c933512927, "indexing" to schema_feeb8bb50144d96d, "nextCursor" to schema_e333e5cd970cf11f, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ca98effeead73f13: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "type"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "type" to schema_3ac0e8087f32acdf), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_cab926bfae4fdbf9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("completedTurnsLimit" to schema_be268483fb86810f, "cursor" to schema_36fea325bf1aca70, "limit" to schema_be268483fb86810f, "maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "notices" to schema_f67f6cbe63879b24, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cac7783fa7c0ea01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "path"), properties = mapOf("fingerprint" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb2e3d3519422e78: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("deleteBranch" to schema_f8b6dd8128e8bfe0, "expectedBranch" to schema_36fea325bf1aca70, "expectedOwnerToken" to schema_8e43cad70cd70de7, "force" to schema_f8b6dd8128e8bfe0, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("git.remove-worktree.owner-requires-branch"))
}

internal val schema_cb34d50832b1e60d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("http"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb6c8dab738236e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name"), properties = mapOf("maxExclusiveMajor" to schema_23e05d248383ea40, "minVersion" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb81a9dbb81a1a63: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal"), JsonPrimitive("server")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cb95bf43ec62db01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "createdAt", "id"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "createdAt" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "reactions" to schema_45e52f032f196485, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbad4936b49ad671: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_da546ba4a0601e6e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbc64d14585e9a92: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbe0ba241100dba5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "current"), properties = mapOf("branches" to schema_6b97469fe43177d6, "current" to schema_bf0b727f7b1c6d07, "defaultBranch" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbf78da83a6846d0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("excludePatterns", "useIgnoreFiles"), properties = mapOf("excludePatterns" to schema_0f732b9fceb2c6ac, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cbf9eddea4280dec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs", "pullRequests", "status"), properties = mapOf("prs" to schema_a7a958b1f69d54ee, "pullRequests" to schema_f86171557f2ff456, "status" to schema_0200f968d21b338b, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cc1f68c41f086183: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cc9733aab3f25827: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "commentId", "expectedBody", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "commentId" to schema_97d85a5eaee82b97, "expectedBody" to schema_bf0b727f7b1c6d07, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_97d85a5eaee82b97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ccc27289c741798a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "target"), properties = mapOf("credentialRef" to schema_e301e52cd3d3ea46, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "legacyConnectionId" to schema_d855999aed5e6438, "port" to schema_279eee1efa9da6c8, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ccd3eb53d3a096b7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("directoryPath", "entries"), properties = mapOf("directoryPath" to schema_bf0b727f7b1c6d07, "entries" to schema_bdb4eecbb625c500), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ccd4545c11e5d91a: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentKind" to schema_36fea325bf1aca70, "pluginOverrides" to schema_6db96506f253ef73, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd0a57f27ae4fccb: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9dee5b496693b179, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd0f41825028e154: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("defaultSerial", "devices"), properties = mapOf("defaultSerial" to schema_97d85a5eaee82b97, "devices" to schema_0a18d7dfd6025fad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd124b21d98c4aa2: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("actions" to schema_9f0df99b7a4b0249, "cleanupScript" to schema_bf0b727f7b1c6d07, "setupScript" to schema_bf0b727f7b1c6d07, "worktreeCopyPatterns" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd357f47aa772b6a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0288aefad61e0244, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cd6770504afebb5a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("configured"), JsonPrimitive("absent"), JsonPrimitive("missing"), JsonPrimitive("retained"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cda18ebe4af54c5c: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdc4a9f3587d0382: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c0551fbf082fff0f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdc63841ca583c5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "type", "vars"), properties = mapOf("description" to schema_2d0b6ec9f2b2decf, "id" to schema_36fea325bf1aca70, "link" to schema_2d0b6ec9f2b2decf, "name" to schema_36fea325bf1aca70, "type" to schema_aaf42afe3bc86594, "vars" to schema_02f62ff4e29426df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdcee850f284e657: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cdd89e732d29ca0e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_1fbc0e0d793ae9f1, "usage" to schema_80ac3a097b3c79c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ce6e21bdeb9c2f10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_66d66ce0fd3d9001), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cf7eae9345350df4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("idle"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_cff1242509563941: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_2b4ffb830b606cf1, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d06f3ce55df8317d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("configured"), JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0762ef7709479bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("day", "totals"), properties = mapOf("day" to schema_bf0b727f7b1c6d07, "totals" to schema_05af39c3e918ff5a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0b10c04efa78c87: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a59d7f7afd3350b1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0ecd43b5f1b261a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d0fa817300598095: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c30da54b853babca, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d12ea655163290cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("run")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1624ea0ecc46dc6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fast"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_d1beee40ea84d2e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"), properties = mapOf("fastModePercent" to schema_80c415b6e27c6ebd, "mcpToolCalls" to schema_56aa0e45cbdce0d0, "mostActiveHour" to schema_58f9a3fda2694c76, "skillsExplored" to schema_56aa0e45cbdce0d0, "subagentRuns" to schema_56aa0e45cbdce0d0, "topModel" to schema_9fe1fe9bbcff3ecd, "topProvider" to schema_9fe1fe9bbcff3ecd, "topReasoning" to schema_9fe1fe9bbcff3ecd, "totalSkillsUsed" to schema_56aa0e45cbdce0d0, "workflowRuns" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1c4cb16ae4c331e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "runAt"), properties = mapOf("kind" to schema_e5ee0a072228c0a3, "runAt" to schema_38adcf16c79023ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1d1696e7dc33885: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop"), JsonPrimitive("helper")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1d29954f5424dc9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-token"), JsonPrimitive("provider-session")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1df243f455504fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("message" to schema_bf0b727f7b1c6d07, "messageKey" to schema_bf0b727f7b1c6d07, "type" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d1eba06c8a5dc0a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notes"), properties = mapOf("notes" to schema_6df40201d8c95128), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d205867a8963e342: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"), properties = mapOf("appVersion" to schema_36fea325bf1aca70, "auth" to schema_2a8bc62fab6ac143, "capabilities" to schema_ea00d31cd890ed26, "desktopId" to schema_36fea325bf1aca70, "endpoints" to schema_17c2b8a25332cd3a, "hostMode" to schema_d1d1696e7dc33885, "label" to schema_36fea325bf1aca70, "platform" to schema_7583b8d37fafbf18, "protocolVersion" to schema_8d7cbafc0ecc27cb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
