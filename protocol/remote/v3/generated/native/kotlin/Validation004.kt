// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
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

internal val schema_43de714a72a211df: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"), properties = mapOf("backgroundTasks" to schema_00675d64d428c3d1, "batches" to schema_e8dd61708d6e7a63, "completedTurns" to schema_4c20b501501c0ba4, "completedTurnsNextCursor" to schema_df704162f3d15808, "contextUsage" to schema_e47ad2358cf0df53, "followUpQueue" to schema_91dcfb42aac98166, "kind" to schema_e1a91348d83820fb, "runtimeNotice" to schema_1468dfe9a2db9c9d, "runtimeResumeCursor" to schema_36fea325bf1aca70, "runtimeStateCurrent" to schema_feeb8bb50144d96d, "snapshotSeq" to schema_56aa0e45cbdce0d0, "thread" to schema_c84f860f0ebf373b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_463d6b3b6ababee5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "snapshot"), properties = mapOf("kind" to schema_9e712b4f87e5beb0, "snapshot" to schema_c1e045b9ce6692db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_48de96c42130e156: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_82e8027595898a28, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_48ed3fa6cae99861: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prs"), properties = mapOf("prs" to schema_0660587dd1508064), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_49162371ff415b49: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("steer"), JsonPrimitive("queue")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_499c208da1aa1d4c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("history"), properties = mapOf("history" to schema_d8a759ff11f9b49b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_4d5989d27d26b612: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("delete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d7f9a55217d713f: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 2, maxItems = 8, items = schema_d421f334c875b51b, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4d961f4317bd34ea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_4dea101cb65656f3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "marketplace", "name", "official", "rank", "skillId", "source"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "installs" to schema_56aa0e45cbdce0d0, "marketplace" to schema_118f67a0fa6bb27d, "name" to schema_36fea325bf1aca70, "official" to schema_feeb8bb50144d96d, "rank" to schema_23e05d248383ea40, "securityGrade" to schema_e987f23b082616d2, "securityScore" to schema_a581e67cd137ad59, "skillId" to schema_36fea325bf1aca70, "source" to schema_36fea325bf1aca70, "sourcePath" to schema_36fea325bf1aca70, "sourceRef" to schema_36fea325bf1aca70, "sourceUrl" to schema_6bb6e13415c8cbba, "stars" to schema_56aa0e45cbdce0d0, "updatedAt" to schema_36fea325bf1aca70, "votes" to schema_56aa0e45cbdce0d0, "weeklyInstalls" to schema_4666c29660989480), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4df989d5459165c8: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_56a9bf5bf312d537, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4e1c353012bcb7ec: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "name", "number", "status"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "number" to schema_3d06117798bf5171, "startedAt" to schema_bf0b727f7b1c6d07, "status" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4eb37bd43cbe100e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "created", "tracking"), properties = mapOf("ahead" to schema_3d06117798bf5171, "behind" to schema_3d06117798bf5171, "branch" to schema_bf0b727f7b1c6d07, "created" to schema_feeb8bb50144d96d, "tracking" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ebdedd585fb4ce9: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_2026fc0dbcc6e193, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ec1299a984102e2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("acknowledge")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4ec1d31e87eeb7a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_046f6b1ae10fa4ef), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4f399075769723a3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "payload"), properties = mapOf("id" to schema_f355c9e66a3091a2, "payload" to schema_5cb1759d88da4b15), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_4f84b56b06f60ea1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("http")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_500ee3799383d21f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_3e68ba0d03654c68, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_501221cdcb9cd48b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind", "name"), properties = mapOf("id" to schema_36fea325bf1aca70, "kind" to schema_c669b4e26b2b7569, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5027b509e87ee5fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "projectLocation", "type"), properties = mapOf("path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_505ae61467accdeb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoint"), properties = mapOf("checkpoint" to schema_09b66dd237e8c823), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_506f036707472345: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("accepted"), JsonPrimitive("declined"), JsonPrimitive("answered"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_50d5adf9e97ef8bd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "prompt", "threadId"), properties = mapOf("expectedStagedAt" to schema_80c415b6e27c6ebd, "id" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_50e8e4265cb34b55: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_513dd8593f33208a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_515482d2104d1efa: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51733da614782090: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authenticatedUrls"), properties = mapOf("authenticatedUrls" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_518b8374aca2de65: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("update-available")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51cc694dc5da9f2a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_47fd370c6dedf4fa, schema_43639d56ca3f1150), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51d89a5cbbb635e7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("actions"), properties = mapOf("actions" to schema_9f0df99b7a4b0249, "cleanupScript" to schema_bf0b727f7b1c6d07, "setupScript" to schema_bf0b727f7b1c6d07, "worktreeCopyPatterns" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51e99f5d3372fb77: RemoteSchema by lazy {
    RemoteSchema(type = "string", format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("push.web.endpoint-https"))
}

internal val schema_51f2acb99ea96b5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId"), properties = mapOf("kind" to schema_3df0ab0b4ea7223c, "tabId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_51fc061b3ecc735c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("newLocation", "projectId"), properties = mapOf("newLocation" to schema_080f9cc154af9e27, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_522b0d7f41276332: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hash", "message"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "hash" to schema_bf0b727f7b1c6d07, "message" to schema_bf0b727f7b1c6d07, "reapplyConflicting" to schema_feeb8bb50144d96d, "stashPreserved" to schema_feeb8bb50144d96d, "stashReapplied" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_5296d6b04d46b630: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4c967d4ed16edbc1, schema_e0da1e0a5e3cd077, schema_a66324f9a46c480b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_536f7d46d82f480f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_2c97b9d429a794cb, "numTurns" to schema_56aa0e45cbdce0d0, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53996e5a27a5b0c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("push.routing.client-connection-id.lowercase"))
}

internal val schema_53ceafeed27db1df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_53f3c1938556e280: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 0.0, maximum = 59.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
