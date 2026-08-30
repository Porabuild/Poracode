// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_9eed5c4959909cfe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("windows"), JsonPrimitive("wsl"), JsonPrimitive("posix")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f0df99b7a4b0249: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_1544bc59ff42b21c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1da8cf549c341e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"), properties = mapOf("additions" to schema_3d06117798bf5171, "author" to schema_a99c73e81a312991, "baseBranch" to schema_bf0b727f7b1c6d07, "body" to schema_bf0b727f7b1c6d07, "changedFiles" to schema_3d06117798bf5171, "checks" to schema_3c115ff749c28304, "closedAt" to schema_2d0b6ec9f2b2decf, "comments" to schema_971eac5c1ec68beb, "commits" to schema_19cc91cdde8419f3, "createdAt" to schema_bf0b727f7b1c6d07, "deletions" to schema_3d06117798bf5171, "headBranch" to schema_bf0b727f7b1c6d07, "mergedAt" to schema_2d0b6ec9f2b2decf, "mergedBy" to schema_da37aeddd0e606ac, "number" to schema_23e05d248383ea40, "reviews" to schema_1fc25f3569e514e5, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f1edfda198d533d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("git-state-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9f20fb68ee791598: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("turn.started")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9fe1fe9bbcff3ecd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "key", "label", "percent"), properties = mapOf("count" to schema_80c415b6e27c6ebd, "key" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "percent" to schema_80c415b6e27c6ebd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9fed07fec8050182: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user_message"), JsonPrimitive("assistant_message"), JsonPrimitive("reasoning"), JsonPrimitive("plan"), JsonPrimitive("goal"), JsonPrimitive("command_execution"), JsonPrimitive("file_change"), JsonPrimitive("tool_call"), JsonPrimitive("mcp_tool_call"), JsonPrimitive("image_view"), JsonPrimitive("dynamic_tool_call"), JsonPrimitive("web_search"), JsonPrimitive("question_answer"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9fef93fbe5070566: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session-5h"), JsonPrimitive("weekly"), JsonPrimitive("weekly-opus"), JsonPrimitive("weekly-sonnet"), JsonPrimitive("weekly-fable"), JsonPrimitive("monthly"), JsonPrimitive("extra-usage"), JsonPrimitive("cursor-auto"), JsonPrimitive("cursor-api")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_9ff1236d4782edc7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c04b1452d18edb3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a023928e20a71a47: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("warning")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a02c812507215fb8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destinationScope", "mode", "sourcePath"), properties = mapOf("availability" to schema_9c8337f42f233534, "destinationScope" to schema_ac6ea0fc110d7efb, "mode" to schema_aa2d0958d3ec845a, "projectLocation" to schema_080f9cc154af9e27, "replace" to schema_f8b6dd8128e8bfe0, "sourcePath" to schema_36fea325bf1aca70, "sourceProjectLocation" to schema_080f9cc154af9e27, "sourceWslDistro" to schema_36fea325bf1aca70, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a087b069daed224f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("destination", "kind", "serverId", "source"), properties = mapOf("destination" to schema_dc99757951407418, "kind" to schema_a77c8545896b4c52, "serverId" to schema_36fea325bf1aca70, "source" to schema_dc99757951407418), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a1f40266b6e1acfa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prepare-worktree")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a20681cb358b7044: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("project", "pullRequestKeys", "refreshedAt"), properties = mapOf("project" to schema_83470ce63973b6e2, "pullRequestKeys" to schema_0f732b9fceb2c6ac, "refreshedAt" to schema_bf0b727f7b1c6d07, "viewerLogin" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a26f77dd4ad13e5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("targetPort"), properties = mapOf("targetPort" to schema_279eee1efa9da6c8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_a5b7c88e398574a5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("agent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a656e9f9963686f0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("groupId", "groupName", "kind"), properties = mapOf("groupId" to schema_36fea325bf1aca70, "groupName" to schema_36fea325bf1aca70, "kind" to schema_f399af5f8dcf6035), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_a6d4c4f03b250194: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"), properties = mapOf("canLinkToGlobal" to schema_feeb8bb50144d96d, "effectiveSkillIds" to schema_0f732b9fceb2c6ac, "invocation" to schema_7a20e2f82d6f16d6, "issues" to schema_ee5346688873f70f, "skills" to schema_bcd368b2fa9950b0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a6f98c7f485db267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "worktreePaths"), properties = mapOf("detail" to schema_15cae388d0cdd5b6, "projectLocation" to schema_080f9cc154af9e27, "worktreePaths" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a77c8545896b4c52: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a799b0e11ed8f6df: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("usage.spent")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a7af012dd26c2f45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_3252cdd51930a222, "id" to schema_36fea325bf1aca70, "type" to schema_07971608588bb2db), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a85bbc4abd9b5411: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_99d0ed7b003eaf52, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a87d1660d66bace7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("events"), properties = mapOf("events" to schema_ab79b5853d26c3e7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a8dfb6388d9edb75: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("pulled", "pushed"), properties = mapOf("pulled" to schema_feeb8bb50144d96d, "pushed" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a90fffdae1680bd2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("clientConnectionId", "desktopId", "version"), properties = mapOf("clientConnectionId" to schema_53996e5a27a5b0c4, "desktopId" to schema_c7e9848de3a346ed, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_a9266ff57466f267: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("versions"), properties = mapOf("versions" to schema_5f5ea22d1d79751d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_aa2e4a946a9060bf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "enabled", "name", "prompt", "recurrence"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_048d1517dd77004e, "enabled" to schema_feeb8bb50144d96d, "name" to schema_b89c357946c21293, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_d8fa37f0ae821721), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aac2a4e83d2823be: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aaf42afe3bc86594: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("env_var")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aafa8395560c3ea5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("never"), JsonPrimitive("running"), JsonPrimitive("succeeded"), JsonPrimitive("failed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab08aad343958c81: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("data", "fromCursor", "generation", "processState", "status", "terminalSize", "toCursor"), properties = mapOf("data" to schema_bf0b727f7b1c6d07, "fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_df704162f3d15808, "processState" to schema_f156a9bc12c3639a, "status" to schema_0200f968d21b338b, "terminalSize" to schema_2d2a48957e54670a, "toCursor" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.ready-range-utf16"))
}

internal val schema_ab5271048956dc05: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("item.completed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab58da84eaa66434: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "usedPercent"), properties = mapOf("currency" to schema_bf0b727f7b1c6d07, "id" to schema_7be168d0c02a30f1, "label" to schema_bf0b727f7b1c6d07, "limit" to schema_f696f11685898ba7, "resetsAt" to schema_56aa0e45cbdce0d0, "unit" to schema_c263982707afed92, "used" to schema_f696f11685898ba7, "usedPercent" to schema_a581e67cd137ad59), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab6b873225f5c96a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser-mirror-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ab79b5853d26c3e7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c6773b11bd57a846, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aba5d69bfdbd30c9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseModifiedAtMs", "content", "path", "projectLocation"), properties = mapOf("baseModifiedAtMs" to schema_f696f11685898ba7, "content" to schema_bf0b727f7b1c6d07, "path" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ac6ea0fc110d7efb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("global"), JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_aca97eda78815baa: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_b2a9cad3f0f3b617, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_acf85c3d3b25a389: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_01e21946e943d3eb, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad1d9fe8b3eda038: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e2d96ee09e9d99a2, schema_d95fd60152159d7a, schema_591e7e71be40d4d4), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ad47ba9b42ffac44: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"), properties = mapOf("completedTurns" to schema_4c20b501501c0ba4, "contextUsage" to schema_e47ad2358cf0df53, "runtimeItems" to schema_d3749f0d30f56447, "runtimeNextCursor" to schema_60e901bdbc3f78cd, "snapshotSeq" to schema_56aa0e45cbdce0d0, "terminalScrollback" to schema_bf0b727f7b1c6d07, "terminalSize" to schema_55ee222c096690dc, "thread" to schema_85fe4f2f372c1ac3, "updatedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae00c10b95f24c44: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("brew" to schema_36fea325bf1aca70, "builtIn" to schema_685dee710cb094fd, "homebrewCask" to schema_36fea325bf1aca70, "installer" to schema_540ab9236f8c36ab, "latestVersionUrls" to schema_c2e8606952666d2c, "npm" to schema_36fea325bf1aca70, "verifyBuiltInVersionChange" to schema_feeb8bb50144d96d, "winget" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ae26bc52b712b00c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("7d"), JsonPrimitive("30d"), JsonPrimitive("all")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af6b6f72d4304b97: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-unwatch")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_af9e7187ee39d2c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "path", "providerId"), properties = mapOf("message" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70, "providerId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b01e26e0438140cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "worktreePath"), properties = mapOf("kind" to schema_a1f40266b6e1acfa, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b096158c792e0431: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill"), JsonPrimitive("subagent"), JsonPrimitive("tool"), JsonPrimitive("mcp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b0c6bfbd3c01430a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"), properties = mapOf("completedAt" to schema_01f7df3e67448982, "error" to schema_2d0b6ec9f2b2decf, "id" to schema_d855999aed5e6438, "scheduleId" to schema_d855999aed5e6438, "startedAt" to schema_7ba6d49874a01b9e, "status" to schema_d21b71d44dcb47ab, "summary" to schema_2d0b6ec9f2b2decf, "threadId" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b12a7fe10e067771: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "runAt"), properties = mapOf("kind" to schema_e5ee0a072228c0a3, "runAt" to schema_7ba6d49874a01b9e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b160fc20dd335dc3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("workspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b2a9cad3f0f3b617: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"), properties = mapOf("ahead" to schema_56aa0e45cbdce0d0, "behind" to schema_56aa0e45cbdce0d0, "branch" to schema_bf0b727f7b1c6d07, "isRepo" to schema_feeb8bb50144d96d, "pr" to schema_9d263023fc1dd3de, "totalDeletions" to schema_56aa0e45cbdce0d0, "totalInsertions" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b305c5dcc2d06cc2: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^gemini:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3925744a8258fb7: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_9bb33af2f649fdd1, schema_2b7595c3da8bc0e9, schema_da66851500474562, schema_4c08f56d9358b723, schema_27aa97567424846c, schema_37addcca5b32752c), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3a47e8838c4a831: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicies" to schema_d0b10c04efa78c87, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizes" to schema_d0b10c04efa78c87, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_515482d2104d1efa, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_cb81a9dbb81a1a63, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_e163a1a22234ae4f, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_d0b10c04efa78c87, "modes" to schema_acf85c3d3b25a389, "presentationMode" to schema_6508684ba659826b, "presentationModes" to schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_d0b10c04efa78c87, "settingDefs" to schema_113b6f36094df840, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_feeb8bb50144d96d, "supportsResume" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4a8e17084bc4fba: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5c1f44eaf04477b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("assistant_text"), JsonPrimitive("reasoning_text"), JsonPrimitive("plan_text"), JsonPrimitive("command_output"), JsonPrimitive("file_change_output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5c2da7c663c997c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_79608b5eceb792fe, "enabledMcpServers" to schema_cda18ebe4af54c5c, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "usage" to schema_b6aaa17d322b8355, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5e66c2e9667a210: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bearer-access-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b61004d40d3caef8: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6aaa17d322b8355: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_b9dfb5a053707da9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_bc01786c116784f4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("failedOnly" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_bcd368b2fa9950b0: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_e5fb86c01876b803, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bcfa7bac51229113: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b0c6bfbd3c01430a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bcff7a89192b7e6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_150828825a4ec4d6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd136ee4bcce8b07: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloading")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd23acb1d60bc91b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state", "type"), properties = mapOf("state" to schema_ecc6edb6166acda9, "type" to schema_47e02a8368712956), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd2deb493c08ce37: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "title"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd96f28e94e5dff9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("redirect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdadccb73a92373f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3, "setUpstream" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdb4eecbb625c500: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c073582d4fa79e4e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be268483fb86810f: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 500.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bea1bdef18933d97: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_d92866345cd97821, schema_8ace86d01d0cc126, schema_2a43ea36a62fa6ac), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf0b727f7b1c6d07: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf3a4ed0e5798352: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7a4831c3c01cfb91, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bfc0c020a52f85b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive("origin"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c04b1452d18edb3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_0e40f389d72655d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_c05447d902cc13c5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"), properties = mapOf("accounts" to schema_d0fa817300598095, "available" to schema_feeb8bb50144d96d, "device" to schema_26f96950d20651b3, "generatedAt" to schema_3d06117798bf5171, "lifetimeTokens" to schema_56aa0e45cbdce0d0, "models" to schema_195974ed118a4217, "peakDay" to schema_bf0b727f7b1c6d07, "peakDayTokens" to schema_56aa0e45cbdce0d0, "providers" to schema_d0fa817300598095, "scope" to schema_b99ee3af304513c2, "timezoneOffsetMinutes" to schema_3d06117798bf5171, "tokenHeatmap" to schema_c1094a243b47f83c, "unavailableProviders" to schema_0f732b9fceb2c6ac, "windowDays" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c0551fbf082fff0f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("approve"), JsonPrimitive("request-changes"), JsonPrimitive("comment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c073582d4fa79e4e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "path", "type"), properties = mapOf("hasChildren" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "path" to schema_bf0b727f7b1c6d07, "type" to schema_8d3732b59a0dd026), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c086073e61ba1068: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1094a243b47f83c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cells", "max", "metric", "windowDays"), properties = mapOf("cells" to schema_08654ec33ed5db02, "max" to schema_56aa0e45cbdce0d0, "metric" to schema_b7f9b9a51ee842c4, "windowDays" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
