// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_a36830c34a81f248: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_60fc988aefaed4f5), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a399fbc7541223f3: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_5ea95607826c2d23, schema_12ca2594dca47145, schema_43372628accc1dd8, schema_0e036ef4dad9c975, schema_849e43bfc063f1bb, schema_501221cdcb9cd48b, schema_1806ffb1da5fcacb), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a39dd0410456fe31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("balance"), properties = mapOf("balance" to schema_80c415b6e27c6ebd, "currency" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "unlimited" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a4457c545e0e0489: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"), properties = mapOf("baseBranch" to schema_bf0b727f7b1c6d07, "checksStatus" to schema_bf0b727f7b1c6d07, "headSha" to schema_bf0b727f7b1c6d07, "isDraft" to schema_feeb8bb50144d96d, "mergeStateStatus" to schema_ecf46d016507c672, "mergeable" to schema_05ab37f667d37cfc, "number" to schema_23e05d248383ea40, "reviewDecision" to schema_bf0b727f7b1c6d07, "state" to schema_79fd49e14d0e7e17, "title" to schema_bf0b727f7b1c6d07, "updatedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "viewerDidAuthor" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a44865d83be28e9f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_36fea325bf1aca70, schema_80c415b6e27c6ebd), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a467b0ed1c0ea208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "minute"), properties = mapOf("kind" to schema_6f5933af0336650b, "minute" to schema_53f3c1938556e280), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a581e67cd137ad59: RemoteSchema by lazy {
    RemoteSchema(type = "number", minimum = 0.0, maximum = 100.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a59d7f7afd3350b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label"), properties = mapOf("description" to schema_36fea325bf1aca70, "id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tooltipDescription" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5af9fa380f11a11: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 2048, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a5b7c88e398574a5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a633f9a256d1d0c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("reason", "seq", "type"), properties = mapOf("reason" to schema_36fea325bf1aca70, "seq" to schema_56aa0e45cbdce0d0, "space" to schema_22c1b4b934fdb197, "type" to schema_d9640543f6c97ed9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a66324f9a46c480b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_3120d80990432c9a, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_a6940e107dbdb450: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fwt"), properties = mapOf("fwt" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6ba34cd39bf30c5: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", defaultValue = JsonPrimitive(true), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6c274420d82c814: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 2, items = schema_97a2308a409b73af, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6f98c7f485db267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "worktreePaths"), properties = mapOf("detail" to schema_15cae388d0cdd5b6, "projectLocation" to schema_080f9cc154af9e27, "worktreePaths" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a76106fec07f8e2b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("read"), JsonPrimitive("appearance"), JsonPrimitive("textSize"), JsonPrimitive("orientation"), JsonPrimitive("reduceMotion"), JsonPrimitive("network"), JsonPrimitive("location"), JsonPrimitive("permission"), JsonPrimitive("openUrl"), JsonPrimitive("launchApp"), JsonPrimitive("powerOff")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a77c8545896b4c52: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a799b0e11ed8f6df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("usage.spent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8565e7811b17010: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("h264")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8b4490d4a4f6745: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("owned"), JsonPrimitive("removed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8dfb6388d9edb75: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pulled", "pushed"), properties = mapOf("pulled" to schema_feeb8bb50144d96d, "pushed" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8eb5a0e025da439: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "presentationMode"), properties = mapOf("agentInstanceId" to schema_36fea325bf1aca70, "agentKind" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_a8f9536c8e956810: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_2e2f445a742056c6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a90fffdae1680bd2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("clientConnectionId", "desktopId", "version"), properties = mapOf("clientConnectionId" to schema_53996e5a27a5b0c4, "desktopId" to schema_c7e9848de3a346ed, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9266ff57466f267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("versions"), properties = mapOf("versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a93427ae1fb25d32: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "targetThreadId"), properties = mapOf("kind" to schema_54e79a700cdcdd03, "targetThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a93ba7bf23f9b121: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_c7bfc39efc965eed), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a99c73e81a312991: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("login"), properties = mapOf("avatarUrl" to schema_bf0b727f7b1c6d07, "login" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9e065ca182491e5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-done")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa2d0958d3ec845a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("copy"), JsonPrimitive("link")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa35b4044d2b1d2c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("childTicket"), properties = mapOf("childTicket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aa5449703b29a615: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("never"), JsonPrimitive("running"), JsonPrimitive("waiting-for-approval"), JsonPrimitive("succeeded"), JsonPrimitive("failed"), JsonPrimitive("cancelled"), JsonPrimitive("interrupted"), JsonPrimitive("skipped")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aac2a4e83d2823be: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aaf42afe3bc86594: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("env_var")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aafcd63530265fa8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "revision"), properties = mapOf("kind" to schema_442f4438e0362260, "record" to schema_1be5ac91cc4357cb, "revision" to schema_36fea325bf1aca70, "rows" to schema_a16cb9740d19657e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab08aad343958c81: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "status" to schema_0200f968d21b338b, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.ready-range-utf16"))
}

internal val schema_ab5271048956dc05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab6b873225f5c96a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-mirror-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab9af0b233ebeb7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "inputAdmission", "proxyHelpers", "streamSettings", "url"), properties = mapOf("device" to schema_97d85a5eaee82b97, "inputAdmission" to schema_d2dd3595e1b5e5dc, "proxyHelpers" to schema_d2dd3595e1b5e5dc, "streamSettings" to schema_e0e12d4798687ab0, "url" to schema_833ba85e740a223b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aba5d69bfdbd30c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseModifiedAtMs", "content", "path", "projectLocation"), properties = mapOf("baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abcfe9be3ea6f135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("initialDelaySeconds", "kind", "maxAttempts", "maxDelaySeconds"), properties = mapOf("initialDelaySeconds" to schema_e9f57f9b4751d6e1, "kind" to schema_1dff9447e3354b05, "maxAttempts" to schema_f7164d030c9bbeaf, "maxDelaySeconds" to schema_e9f57f9b4751d6e1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_abff99d05c43ad4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("enabled"), JsonPrimitive("disabled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac157d37d82304b4: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 240, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_ac6ea0fc110d7efb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac7865b2a567eb07: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("days", "kind", "time"), properties = mapOf("days" to schema_f7b2db2c4c7fbdd3, "kind" to schema_475f91db7d51b153, "time" to schema_b61004d40d3caef8, "timeZone" to schema_be5d5f9829abefd6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aca97eda78815baa: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_b2a9cad3f0f3b617, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acccf296d86b4026: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("experiments", "revision"), properties = mapOf("experiments" to schema_2f3c74eaed971b9f, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acf85c3d3b25a389: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad1d9fe8b3eda038: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e2d96ee09e9d99a2, schema_d95fd60152159d7a, schema_591e7e71be40d4d4), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad6bb2de51c0e05f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("amount", "currency"), properties = mapOf("amount" to schema_f696f11685898ba7, "currency" to schema_e22de6db69f83369), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad717b46720997d8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"), properties = mapOf("activeThreadId" to schema_2d0b6ec9f2b2decf, "agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "blockedReason" to schema_7dccd2754fedc801, "config" to schema_f69100925fc0e774, "headBranch" to schema_36fea325bf1aca70, "lastCheckKey" to schema_2d0b6ec9f2b2decf, "lastCommentCursor" to schema_2d0b6ec9f2b2decf, "lastError" to schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor" to schema_2d0b6ec9f2b2decf, "lastReviewCursor" to schema_2d0b6ec9f2b2decf, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_ad7a7271b0f87095: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("created" to schema_feeb8bb50144d96d, "ok" to schema_d2dd3595e1b5e5dc, "project" to schema_3bac601a40e32bf3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_adaa80878b467841: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("effort"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_ae26bc52b712b00c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae3b637db050db2a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1be1630ac362ee37, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae4a7605815e4393: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archivedAt", "changedFiles", "outcome", "severity", "stopReason", "summary", "unread"), properties = mapOf("archivedAt" to schema_595da89b21b7ca56, "changedFiles" to schema_3f02a5451ac550c4, "completionEvaluation" to schema_b2d5bb9fac49f2fc, "outcome" to schema_75fa28583d2c03c2, "severity" to schema_2d5efa5a796cb8bd, "stopReason" to schema_7bbdba78cb64cd5f, "summary" to schema_74b3a4e21747a253, "unread" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af6b6f72d4304b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af9e7187ee39d2c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "path", "providerId"), properties = mapOf("message" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "providerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_afbf6761fa459396: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("existingProjectIds", "existingThreadIds"), properties = mapOf("existingProjectIds" to schema_515482d2104d1efa, "existingThreadIds" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b01e26e0438140cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "worktreePath"), properties = mapOf("kind" to schema_a1f40266b6e1acfa, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b0304b9d9dfc2690: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCache", "snapshots"), properties = mapOf("fromCache" to schema_feeb8bb50144d96d, "snapshots" to schema_c5a10234205e6cd2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b03238f5530b04fb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "shellId"), properties = mapOf("initialSize" to schema_55ee222c096690dc, "projectLocation" to schema_080f9cc154af9e27, "shellId" to schema_36fea325bf1aca70, "startInHome" to schema_feeb8bb50144d96d, "windowsShellRuntime" to schema_9368b22ce42bb60e, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b096158c792e0431: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill"), JsonPrimitive("subagent"), JsonPrimitive("tool"), JsonPrimitive("mcp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b09b259cd2bbc25d: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("slashCommands" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b160fc20dd335dc3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("workspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b23ca9582f16c4d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("browserFocus" to schema_f9c97c26b130e744, "conversationSnapshot" to schema_8532cee498146283), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2a9cad3f0f3b617: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"), properties = mapOf("ahead" to schema_56aa0e45cbdce0d0, "behind" to schema_56aa0e45cbdce0d0, "branch" to schema_bf0b727f7b1c6d07, "isRepo" to schema_feeb8bb50144d96d, "pr" to schema_9d263023fc1dd3de, "totalDeletions" to schema_56aa0e45cbdce0d0, "totalInsertions" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2c8fd1712ed6830: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "projectId"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_f69100925fc0e774, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2ca36e3fa7743ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("maxBytes" to schema_f58a8b771657d037, "maxDecodeBytes" to schema_f58a8b771657d037, "order" to schema_42146530bc4d74c4, "projectLimit" to schema_85b777c0c99bbbca, "reads" to schema_4659e6d395f41e16, "summaries" to schema_feeb8bb50144d96d, "threadLimit" to schema_85b777c0c99bbbca), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2d5bb9fac49f2fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("condition", "confidence", "evaluatedAt", "reason", "stopMatched"), properties = mapOf("condition" to schema_5c6957eaa59e2ae2, "confidence" to schema_5d4b39004bf5c532, "evaluatedAt" to schema_38adcf16c79023ce, "reason" to schema_89c223893a706cf8, "stopMatched" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b305c5dcc2d06cc2: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^gemini:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3ef93117a9f9f95: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("portrait"), JsonPrimitive("landscape_left"), JsonPrimitive("portrait_upside_down"), JsonPrimitive("landscape_right")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4441316f1aafac9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "labelKey", "options"), properties = mapOf("id" to schema_36fea325bf1aca70, "labelKey" to schema_36fea325bf1aca70, "options" to schema_1d53b68fd3881a00), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4a8e17084bc4fba: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b53074e6b68baa67: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"), properties = mapOf("contentType" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "modifiedAtMs" to schema_f696f11685898ba7, "sizeBytes" to schema_56aa0e45cbdce0d0, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b588ef57ebadea7a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4ec1d31e87eeb7a4, schema_a93427ae1fb25d32), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5c1f44eaf04477b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("assistant_text"), JsonPrimitive("reasoning_text"), JsonPrimitive("plan_text"), JsonPrimitive("command_output"), JsonPrimitive("file_change_output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5e66c2e9667a210: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bearer-access-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b61004d40d3caef8: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6411354a37352f2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38754692c8b5ebef, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b664e76046bb1915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("format", "text", "version"), properties = mapOf("format" to schema_f1ccd99fb2bc2c2f, "text" to schema_ee49ed668eec9d78, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b67f4828f001c119: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_ca5f8d6782ca9f6b, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6a98d4e6efc4f4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("model"), JsonPrimitive("config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6aaa17d322b8355: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6deccdc9f58eb02: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events"), properties = mapOf("events" to schema_6227384f8fe3c509), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6f35acff2a3428a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("settings"), properties = mapOf("settings" to schema_5ce0ae73fb12b141), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b79d8f64de4f41bd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "worktreePath"), properties = mapOf("isNewWorktree" to schema_feeb8bb50144d96d, "kind" to schema_49f72e8cc565067e, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7ac3adaa07b7aa4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7c373d0981a5441: RemoteSchema by lazy {
    RemoteSchema(type = "null", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b7f9b9a51ee842c4: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prompts"), JsonPrimitive("tokens")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b84e449d1a150abf: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_36fea325bf1aca70, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b89c357946c21293: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_b92447920382853b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("providerId", "providerLabel", "servers", "sourcePath"), properties = mapOf("providerId" to schema_36fea325bf1aca70, "providerLabel" to schema_36fea325bf1aca70, "servers" to schema_409712bfaed84392, "sourcePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b99ee3af304513c2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("device"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b9d24da8425fcc77: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "retryable", "status"), properties = mapOf("code" to schema_c8425979fd5d4887, "reason" to schema_36fea325bf1aca70, "retryable" to schema_feeb8bb50144d96d, "status" to schema_c086073e61ba1068), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b9dfb5a053707da9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bab85ee50a59610a: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 3, maxLength = 255, pattern = "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_badd682f3501e022: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb2e0e6d90c93ccf: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb3cd72cf9e1b0cc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_4d34acc64dd77a5d, "result" to schema_bea1bdef18933d97), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb42560f34ae61e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "label", "type"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "label" to schema_bf0b727f7b1c6d07, "topModel" to schema_bf0b727f7b1c6d07, "topProvider" to schema_bf0b727f7b1c6d07, "type" to schema_645d18fd9a611f68), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb479bc5848b9f45: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skip"), JsonPrimitive("coalesce"), JsonPrimitive("run-latest")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb755d8d8c6227a7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("previewId"), properties = mapOf("device" to schema_97d85a5eaee82b97, "previewId" to schema_d855999aed5e6438), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_bc1920595e8cfd89: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("schedules"), properties = mapOf("schedule" to schema_14f6b52f84064da4, "schedules" to schema_bc6010db82e83d09), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc6010db82e83d09: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_14f6b52f84064da4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc6c91ba1621863d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("active", "host", "login"), properties = mapOf("active" to schema_feeb8bb50144d96d, "host" to schema_bf0b727f7b1c6d07, "login" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc731d8f39fdb4bc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "status"), properties = mapOf("oldPath" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "status" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bc92ea89e2de4f6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("doc", "projectId", "todos", "updatedAt"), properties = mapOf("doc" to schema_6e4ad578250cef79, "projectId" to schema_36fea325bf1aca70, "todos" to schema_e7c244bd461f7229, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bcff7a89192b7e6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_150828825a4ec4d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd136ee4bcce8b07: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloading")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
