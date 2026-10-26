// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_375b3978f669c107: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("upsert")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_378174642bf763b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37addcca5b32752c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_034741cb26a53fe4, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3858e9d5efa1ed03: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_39d804ded18fc33d, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3935a65be87f52c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("type" to schema_921834989f2485e5, "url" to schema_c1504401bd291fd1), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_3958c7beb695f0ca: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ea7fc856bb9aa12e, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3975ceeb3762f594: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version", "watchId"), properties = mapOf("maxChunkBytes" to schema_f58a8b771657d037, "maxWindowBytes" to schema_f58a8b771657d037, "resume" to schema_9997128f830ac42e, "version" to schema_23e05d248383ea40, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_39d6579ca7450396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d804ded18fc33d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "model"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "importedFrom" to schema_3471186f1398f1d2, "mcpServerOverrides" to schema_6db96506f253ef73, "mode" to schema_01e21946e943d3eb, "model" to schema_bf0b727f7b1c6d07, "pluginOverrides" to schema_6db96506f253ef73, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d, "worktreeMode" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39d8d7cbf4384109: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_39f0b40d9df37da7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a008e3c404a93c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a27703aead13583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ownerToken"), properties = mapOf("ownerToken" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a38f5dc8038f065: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 120.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3a762c9b6eacc492: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = -90.0, maximum = 90.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac0e8087f32acdf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reduceMotion")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac3526f6a2607f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_61fc4b3eaedeba13), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad15ffc16029f9a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"), properties = mapOf("adminMerge" to schema_feeb8bb50144d96d, "autoFix" to schema_feeb8bb50144d96d, "autoMerge" to schema_feeb8bb50144d96d, "checks" to schema_feeb8bb50144d96d, "commentEditing" to schema_78ecc0eb2955fb7f, "commitDiffs" to schema_d2dd3595e1b5e5dc, "convertToDraft" to schema_d2dd3595e1b5e5dc, "draft" to schema_feeb8bb50144d96d, "edit" to schema_feeb8bb50144d96d, "expectedHeadMerge" to schema_feeb8bb50144d96d, "labels" to schema_d2dd3595e1b5e5dc, "mergeMethods" to schema_58317133a27c74f8, "reactions" to schema_30057dd734d040ce, "rebaseBranch" to schema_feeb8bb50144d96d, "reopen" to schema_feeb8bb50144d96d, "reviewDecisions" to schema_cdc4a9f3587d0382, "reviewDrafts" to schema_d2dd3595e1b5e5dc, "reviewGuides" to schema_d2dd3595e1b5e5dc, "reviewRequests" to schema_d2dd3595e1b5e5dc, "reviewThreads" to schema_feeb8bb50144d96d, "updateBranch" to schema_feeb8bb50144d96d, "viewedFiles" to schema_ae682752b1c14d17), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad514880db80c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b681a533b5fa621: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c115ff749c28304: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0d39188d7ce690df, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c40bff8b05543d7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_feeb8bb50144d96d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c594c99571d82f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^factory:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c702b70b3eb4220: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("ios-video"), JsonPrimitive("android")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cc2bb39a7445b48: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_a02c812507215fb8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ccadafaab48b090: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("exclude" to schema_cda18ebe4af54c5c, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cd19b85f5490a72: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("url")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cdb2ff0de916278: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 512, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d06117798bf5171: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = -9007199254740991.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d188d85aa0799fe: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("kind" to schema_2d29c7255e1cf1b1, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3d1908a6bccf4864: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-begin")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3dd69184dc64b745: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_adaa80878b467841, schema_d1624ea0ecc46dc6, schema_2840caeaedca16a2, schema_94dda13e1cf59dea), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df0ab0b4ea7223c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("close-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df4f14bf23d248d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3df8195e9076bb2b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("method", "requestId", "response"), properties = mapOf("method" to schema_36fea325bf1aca70, "requestId" to schema_a44865d83be28e9f, "response" to schema_ca3d163bab055381), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e412d7b328b3f5a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_3ccadafaab48b090, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e5dc6593b33f225: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs"), properties = mapOf("prs" to schema_a7a958b1f69d54ee), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e6404f86586fcab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_29b52750e42441f8, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e68ba0d03654c68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ee9ee08aa6a662d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("baseBranch" to schema_36fea325bf1aca70, "body" to schema_bf0b727f7b1c6d07, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("forge.edit.fields"))
}

internal val schema_3f02a5451ac550c4: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 100, items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f3680e5774b47dd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("childDesktopId", "endpoint", "environmentId", "pairingCredential"), properties = mapOf("childDesktopId" to schema_97d85a5eaee82b97, "endpoint" to schema_85c1db78d5c7dc29, "environmentId" to schema_d855999aed5e6438, "pairingCredential" to schema_85c1db78d5c7dc29), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f58316dbb160752: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_23a1c447c059f0da, "id" to schema_36fea325bf1aca70, "type" to schema_740c7dc82a88634a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f5bcd72f92b6f9f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_402930e3e48d3bdd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "pending", "retiring"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "pending" to schema_56aa0e45cbdce0d0, "retiring" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4067ad04bfbe200c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_409712bfaed84392: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_e9e7b28a3dddd9fd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40aab29508fb3256: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("port", "protocol"), properties = mapOf("label" to schema_36fea325bf1aca70, "port" to schema_279eee1efa9da6c8, "protocol" to schema_cb34d50832b1e60d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40f9a6009bf15988: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "operationKey"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "operationKey" to schema_96967a6998f6cab7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41148a177ba98c21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stale")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4127023e4a4ff50e: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_9dbd17894594944e, schema_4de8e3eae98ee9e2), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_412fb1bbf466cf98: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "projectLocation", "threadId"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_413ace8627552254: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model", "selections"), properties = mapOf("effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "selections" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4147389dac614b3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency", "estimated", "period"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_bf0b727f7b1c6d07, "estimated" to schema_feeb8bb50144d96d, "period" to schema_776626d20373881d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41be750b567a2144: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reload")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41bff5c7300a37e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("success"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d, "success" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41d0cf68976485ec: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ios"), JsonPrimitive("android"), JsonPrimitive("web")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41ffeb2050e1e71c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deltaX", "deltaY", "kind", "x", "y"), properties = mapOf("deltaX" to schema_80c415b6e27c6ebd, "deltaY" to schema_80c415b6e27c6ebd, "kind" to schema_00ebeb8fef40c2a6, "x" to schema_80c415b6e27c6ebd, "y" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42146530bc4d74c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("manual"), JsonPrimitive("updated"), JsonPrimitive("created")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42293281b655edaa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "clientDeviceId", "expiresAt", "generation", "id", "mode", "platform", "sessionId", "version"), properties = mapOf("access" to schema_9ca4aec6d46ade2e, "clientDeviceId" to schema_97d85a5eaee82b97, "expiresAt" to schema_80c415b6e27c6ebd, "generation" to schema_d855999aed5e6438, "id" to schema_d855999aed5e6438, "mode" to schema_a8565e7811b17010, "platform" to schema_61e54b5f6751c7a6, "sessionId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_422b1e8c8be5e2c0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_423ec18ef5ab4596: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "login"), properties = mapOf("avatarUrl" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "login" to schema_36fea325bf1aca70, "name" to schema_bf0b727f7b1c6d07, "team" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4244283735615c22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "turnId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_9f20fb68ee791598), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_429303c2d6a42977: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42cef41d59e9b254: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_5d04b357c40b2734, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42dfa7eae97f945c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "releaseWslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431000cfcca50793: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"), properties = mapOf("add" to schema_340c8f8b68b6e2b5, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_23e05d248383ea40, "projectLocation" to schema_080f9cc154af9e27, "remove" to schema_340c8f8b68b6e2b5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4311a74adde583c6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("orientation")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431be1ab7e1b0dc9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_53ceafeed27db1df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43372628accc1dd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_7db74ec55cf0af32, "mimeType" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4348fdb13264571d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "queued"), properties = mapOf("active" to schema_56aa0e45cbdce0d0, "queued" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43639d56ca3f1150: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "status"), properties = mapOf("message" to schema_36fea325bf1aca70, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_437e2d5d20b6b495: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checks"), properties = mapOf("checks" to schema_3c115ff749c28304), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4392338ffc80bed7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_a399fbc7541223f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43d29f1d5a2e1f23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_2d862d697d08c085), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_441bce375b64f3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_442f4438e0362260: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("replace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4492692f82322049: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452e07a326fbbba7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("family-member")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4535713ebdcc5c37: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 60.0, maximum = 86400.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4545388132b77b29: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_c028422c57a7c557), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_455b16a806252fd5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind", "task"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_cbc64d14585e9a92, "task" to schema_7ab420c1b78efb1d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_458a4508393abce2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "current"), properties = mapOf("branches" to schema_6b97469fe43177d6, "current" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45d8e163d2ea2910: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "keyType"), properties = mapOf("fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45e52f032f196485: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_60708133c8c8f499, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_464dbc5abe96a4c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "forge", "host", "repository", "version"), properties = mapOf("account" to schema_c2bb40b82b330cd4, "forge" to schema_eaed3cfbf46d5d81, "host" to schema_2365fa95161a3294, "repository" to schema_36fea325bf1aca70, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT, semanticIds = listOf("forge.watch.scope-identity"))
}

internal val schema_4655073d71f8e50b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_c533fb875972ec60, "id" to schema_36fea325bf1aca70, "type" to schema_07971608588bb2db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4659e6d395f41e16: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bounded-v1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4666c29660989480: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56aa0e45cbdce0d0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_468209f9bb01c8a9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_4cb4c9750289b975, "name" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_46c9cbbd3df64c2a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("conversation"), JsonPrimitive("inline")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4721d11b498e9a74: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("npm-global"), JsonPrimitive("pnpm-global"), JsonPrimitive("bun-global")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_473e9b7f4728cf72: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_feeb8bb50144d96d, "terminal" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_475f91db7d51b153: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("weekly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_479fd2dce7e64e29: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unread"), JsonPrimitive("all"), JsonPrimitive("archived")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47a6c9970249e96b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("access", "path", "projectLocation"), properties = mapOf("access" to schema_8423ce6905ffd393, "path" to schema_bd85a52dd25effae, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
