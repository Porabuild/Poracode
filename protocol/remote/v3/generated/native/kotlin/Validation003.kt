// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_34b5fda496bc72d8: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("omitScrollback" to schema_feeb8bb50144d96d, "runtimePage" to schema_8795ea0289d608d6, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3512bd687eb85e90: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("before"), JsonPrimitive("after")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_356ae1fc455ec4c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rename")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35889b09eb72e208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "ghAvailable", "status", "worktrees"), properties = mapOf("branches" to schema_d715cb198ae66d56, "ghAvailable" to schema_78c0e367e5120eb3, "status" to schema_98139abfca5e2eda, "worktrees" to schema_694e88722e472029), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35962a43ae5cecce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35d4f345ae5694ef: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_e5ba6e7ba571b481, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3615f9310cd4ee9d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_378174642bf763b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36a14ea6cf3d0316: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "input" to schema_f696f11685898ba7, "output" to schema_f696f11685898ba7, "period" to schema_776626d20373881d, "total" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36b9fe91ec45bcd5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("select")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36fea325bf1aca70: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370441a9f9465376: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_a467b0ed1c0ea208, schema_056ce41be8f105d9, schema_d1c4cb16ae4c331e), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370ff0ec0af5649a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_37bea14e334d43c7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_b01e26e0438140cd, schema_bb3534fed407525e, schema_a656e9f9963686f0, schema_1ae7de2180f145f4, schema_2e4d2aaed030369e, schema_c3363423bb669510, schema_80906c6ddc7c6c9e, schema_ebd70a208b453fe1, schema_b79d8f64de4f41bd, schema_09765c7778825d10, schema_431be1ab7e1b0dc9, schema_a93ba7bf23f9b121, schema_370ff0ec0af5649a), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_37eeca9f5377b6e4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "scope"), properties = mapOf("kind" to schema_274e069cdc933ee1, "scope" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_38462ff398fbe205: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("absolutePath", "enabled"), properties = mapOf("absolutePath" to schema_36fea325bf1aca70, "enabled" to schema_feeb8bb50144d96d, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_384bb6ef598ad698: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 6.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3975ceeb3762f594: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version", "watchId"), properties = mapOf("maxChunkBytes" to schema_f58a8b771657d037, "maxWindowBytes" to schema_f58a8b771657d037, "resume" to schema_9997128f830ac42e, "version" to schema_23e05d248383ea40, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3994629a32a97c9b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("workflows"), properties = mapOf("workflows" to schema_030ab3973aced8b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3ac3526f6a2607f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_61fc4b3eaedeba13), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad514880db80c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b31fe417e76c891: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextCursor", "threads"), properties = mapOf("nextCursor" to schema_2d0b6ec9f2b2decf, "threads" to schema_1825cb518b110d40), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b70e9f118e13840: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("discoveredAt", "providerSessionId"), properties = mapOf("discoveredAt" to schema_36fea325bf1aca70, "providerSessionId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b983ddef73d0e2b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_73baee1e403b7ee4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c115ff749c28304: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_0d39188d7ce690df, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3c594c99571d82f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^factory:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cc2bb39a7445b48: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_a02c812507215fb8, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cc399d15908d53a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_4c1171296b6868a1, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ccadafaab48b090: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("exclude" to schema_cda18ebe4af54c5c, "useIgnoreFiles" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3cd19b85f5490a72: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("url")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3e6404f86586fcab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_29b52750e42441f8, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e68ba0d03654c68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f58316dbb160752: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_23a1c447c059f0da, "id" to schema_36fea325bf1aca70, "type" to schema_740c7dc82a88634a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3f5bcd72f92b6f9f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-watch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_412fb1bbf466cf98: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "projectLocation", "threadId"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_422b1e8c8be5e2c0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_4244283735615c22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "turnId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_9f20fb68ee791598), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_429303c2d6a42977: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42dfa7eae97f945c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "releaseWslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_431be1ab7e1b0dc9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_53ceafeed27db1df), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4331716fe2cf5702: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectPullRequestLists", "projects", "pullRequestKeyByBranch", "pullRequests", "revision", "targets"), properties = mapOf("projectPullRequestLists" to schema_d8ae5c3a60a788cd, "projects" to schema_1da8031b611dee7d, "pullRequestKeyByBranch" to schema_e51d77fd6734b53a, "pullRequests" to schema_4c858ee6a42cac59, "revision" to schema_56aa0e45cbdce0d0, "targets" to schema_7675a7cd6ae22dbd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43372628accc1dd8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_7db74ec55cf0af32, "mimeType" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_43aa74a688859ac2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "projectId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_048d1517dd77004e, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_43d29f1d5a2e1f23: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_2d862d697d08c085), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_441bce375b64f3d0: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4492692f82322049: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452971469565c49c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "enabled", "name", "prompt", "recurrence"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_048d1517dd77004e, "enabled" to schema_feeb8bb50144d96d, "name" to schema_b89c357946c21293, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_370441a9f9465376), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_452c70feefa496c6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a4457c545e0e0489, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_458a4508393abce2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "current"), properties = mapOf("branches" to schema_6b97469fe43177d6, "current" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4655073d71f8e50b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_c533fb875972ec60, "id" to schema_36fea325bf1aca70, "type" to schema_07971608588bb2db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4666c29660989480: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56aa0e45cbdce0d0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_473e9b7f4728cf72: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("gui" to schema_feeb8bb50144d96d, "terminal" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_475f91db7d51b153: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("weekly")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c3f1ae81cfac00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("nextParentPath" to schema_38d1a07d3b9b1c82, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c50d7349a5a322: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 23.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47e02a8368712956: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47fd370c6dedf4fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("status" to schema_32773ce5899289ad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482895ec9172a79a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "parentLocation", "source"), properties = mapOf("name" to schema_36fea325bf1aca70, "parentLocation" to schema_080f9cc154af9e27, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_483d5aa44fc0eaba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_c39ba2db208f4f7c, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_485fa06696a88681: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 40, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4864c5f65afc8a79: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commitsAhead", "sourceAhead", "sourceBranch"), properties = mapOf("commitsAhead" to schema_3d06117798bf5171, "sourceAhead" to schema_3d06117798bf5171, "sourceBranch" to schema_2d0b6ec9f2b2decf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4878a3657a97dce6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("role"), properties = mapOf("role" to schema_7e386bfca48a8819, "text" to schema_bf0b727f7b1c6d07, "timestamp" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48de96c42130e156: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_82e8027595898a28, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48ed3fa6cae99861: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs"), properties = mapOf("prs" to schema_0660587dd1508064), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49162371ff415b49: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49437ffdd8ca324e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_837a60dd43077637), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_499c88c1c549e934: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(0.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49f72e8cc565067e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a10e57442c165ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("changesTransferred" to schema_feeb8bb50144d96d, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4a22ffc9b41926c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextName", "path", "projectLocation"), properties = mapOf("nextName" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4aa55712229a85ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "baseBranch", "branch", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "baseBranch" to schema_36fea325bf1aca70, "branch" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "model" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c1171296b6868a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "state", "streams", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "state" to schema_2472eab79ad4b307, "streams" to schema_e51d77fd6734b53a, "type" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c20b501501c0ba4: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_df96bd315b4c0dae, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c858ee6a42cac59: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_5a8fe22d39b2c89d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4c967d4ed16edbc1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("args", "command", "env", "type"), properties = mapOf("args" to schema_aac2a4e83d2823be, "command" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "env" to schema_c3ac2139868061bb, "type" to schema_01f71c4e26e7ecde), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4caa9ebeea5fe346: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message"), properties = mapOf("message" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cb4c9750289b975: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("add-existing")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4cd2587996458d8d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "kind"), properties = mapOf("distro" to schema_36fea325bf1aca70, "kind" to schema_2d8274eae552cc51), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
