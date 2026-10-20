// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_3a762c9b6eacc492: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = -90.0, maximum = 90.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac0e8087f32acdf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("reduceMotion")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ac3526f6a2607f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_61fc4b3eaedeba13), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3ad514880db80c82: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3b681a533b5fa621: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3bac601a40e32bf3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "location", "name"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "disabled" to schema_feeb8bb50144d96d, "ghAccount" to schema_5646cf57ff3aebe0, "icon" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "lastDraftConfig" to schema_05ae4f07092942c9, "location" to schema_080f9cc154af9e27, "name" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "scripts" to schema_51d89a5cbbb635e7, "searchSettings" to schema_3ccadafaab48b090, "workspaceId" to schema_bf0b727f7b1c6d07, "worktreeLocation" to schema_7eb7e8f44a304273), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_3e6404f86586fcab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_29b52750e42441f8, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3e68ba0d03654c68: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("forward")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_40c1a284293664e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "kind", "projectId", "title"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "config" to schema_2c97b9d429a794cb, "groupId" to schema_bf0b727f7b1c6d07, "groupName" to schema_bf0b727f7b1c6d07, "kind" to schema_1f4518886240126e, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_80c415b6e27c6ebd, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "title" to schema_36fea325bf1aca70, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40f2905f535b4d48: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_2c97b9d429a794cb, "numTurns" to schema_f58a8b771657d037, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_40f9a6009bf15988: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpointItemId", "operationKey"), properties = mapOf("checkpointItemId" to schema_36fea325bf1aca70, "operationKey" to schema_96967a6998f6cab7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_41148a177ba98c21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("stale")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4244283735615c22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "turnId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_9f20fb68ee791598), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_429303c2d6a42977: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_42dfa7eae97f945c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "releaseWslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4311a74adde583c6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("orientation")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_452c70feefa496c6: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a4457c545e0e0489, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4591393841333540: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "connectionId", "offerSdp", "threadId"), properties = mapOf("config" to schema_2c97b9d429a794cb, "connectionId" to schema_d855999aed5e6438, "offerSdp" to schema_e78ddc126c04f09d, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45d8e163d2ea2910: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fingerprint", "keyType"), properties = mapOf("fingerprint" to schema_d3359b6d5db5b90d, "keyType" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45dc1a0b166d686a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_3bac601a40e32bf3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_45f6b50cb938a8c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "lastDraftConfig", "projectId"), properties = mapOf("kind" to schema_93f8fa8787f246fe, "lastDraftConfig" to schema_0d58902a07ef1adb, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_47c3f1ae81cfac00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation"), properties = mapOf("nextParentPath" to schema_38d1a07d3b9b1c82, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47c50d7349a5a322: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 23.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47e02a8368712956: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-state")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_47eb55b96bbf5d77: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("contextSize" to schema_0f732b9fceb2c6ac, "effort" to schema_0f732b9fceb2c6ac, "fast" to schema_3c40bff8b05543d7, "thinking" to schema_3c40bff8b05543d7), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_47fd370c6dedf4fa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("status" to schema_32773ce5899289ad), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482895ec9172a79a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "parentLocation", "source"), properties = mapOf("name" to schema_36fea325bf1aca70, "parentLocation" to schema_080f9cc154af9e27, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_482c9282715722ac: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cancel")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4886facc92937666: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("notice")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48ca3a84cd4a6f59: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("boundedCatalogChanges" to schema_a9266ff57466f267, "browserForward" to schema_a9266ff57466f267, "catalogMutations" to schema_a9266ff57466f267, "conversationSearch" to schema_a9266ff57466f267, "conversationSnapshots" to schema_a9266ff57466f267, "deviceWorkspace" to schema_c288e6607451a3b8, "experiments" to schema_a9266ff57466f267, "flatThreadReorder" to schema_a9266ff57466f267, "historyDetails" to schema_a9266ff57466f267, "projectCommandResults" to schema_a9266ff57466f267, "pushRouting" to schema_a9266ff57466f267, "runtimeHistoryNotices" to schema_a9266ff57466f267, "sshEnvironments" to schema_a9266ff57466f267, "terminalCursorSync" to schema_a9266ff57466f267, "threadForks" to schema_a9266ff57466f267, "threadHistoryResume" to schema_a9266ff57466f267, "threadLaunchMetadata" to schema_a9266ff57466f267), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4a927b60e49ddae0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pairing"), properties = mapOf("pairing" to schema_3f3680e5774b47dd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4b43828b172de36c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessibility", "id", "input", "name", "platform", "state"), properties = mapOf("accessibility" to schema_feeb8bb50144d96d, "controls" to schema_edaad5a427ee5ae6, "id" to schema_97d85a5eaee82b97, "input" to schema_feeb8bb50144d96d, "name" to schema_f1deff8504bbc0a3, "platform" to schema_61e54b5f6751c7a6, "state" to schema_51b8dd645024c82d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4b9241d0f311f397: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f83001b0f92b1535, schema_ad7a7271b0f87095), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4d34acc64dd77a5d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("probe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
