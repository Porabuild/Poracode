// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_000753aa3ed87d21: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("session.exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_01f7df3e67448982: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7ba6d49874a01b9e, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0200f968d21b338b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ready")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_03b0262a8a76c7b7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "mode" to schema_01e21946e943d3eb, "model" to schema_36fea325bf1aca70, "sandboxMode" to schema_bf0b727f7b1c6d07, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_048d1517dd77004e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_056ce41be8f105d9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("days", "kind", "time"), properties = mapOf("days" to schema_f7b2db2c4c7fbdd3, "kind" to schema_475f91db7d51b153, "time" to schema_b61004d40d3caef8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05812a27bb4846c1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId"), properties = mapOf("projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05ab37f667d37cfc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("MERGEABLE"), JsonPrimitive("CONFLICTING"), JsonPrimitive("UNKNOWN")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_05feb7407cd8c42f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts"), properties = mapOf("accounts" to schema_26c275b82ebc010d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0660587dd1508064: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_a4457c545e0e0489, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_07cc5ea327d0d20d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("count", "day", "intensity"), properties = mapOf("count" to schema_56aa0e45cbdce0d0, "day" to schema_bf0b727f7b1c6d07, "intensity" to schema_01baf573c6016ec3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_080f9cc154af9e27: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_010485e0a27ea254, schema_fa41f0033e95da89, schema_5f1cf4ab237639a7), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_08654ec33ed5db02: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_07cc5ea327d0d20d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0943be33f9e190f8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("currentDeviceId", "devices"), properties = mapOf("currentDeviceId" to schema_bf0b727f7b1c6d07, "devices" to schema_744f57e3eb025261), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_09cbc76a2a7d52d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("decision", "prNumber", "projectLocation"), properties = mapOf("body" to schema_38d1a07d3b9b1c82, "decision" to schema_c0551fbf082fff0f, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_09f700fdeb3e5213: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_d12ea655163290cc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0bd6eab0e269161f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fastForward", "merged", "newSourceCommit"), properties = mapOf("conflictFiles" to schema_0f732b9fceb2c6ac, "error" to schema_bf0b727f7b1c6d07, "fastForward" to schema_feeb8bb50144d96d, "merged" to schema_feeb8bb50144d96d, "newSourceCommit" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0bd7710eac491f27: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("core" to schema_bf0b727f7b1c6d07, "details" to schema_bf0b727f7b1c6d07, "diff" to schema_bf0b727f7b1c6d07, "files" to schema_bf0b727f7b1c6d07, "reviewThreads" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0c6254245418ba4c: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d39188d7ce690df: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conclusion", "name", "state"), properties = mapOf("completedAt" to schema_bf0b727f7b1c6d07, "conclusion" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "startedAt" to schema_bf0b727f7b1c6d07, "state" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07, "workflowName" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0d82ff6df7340003: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("limit"), properties = mapOf("beforePosition" to schema_56aa0e45cbdce0d0, "limit" to schema_be268483fb86810f, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_0e40f389d72655d0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_83c7c01b4046dd13, schema_de00765ac7659be8, schema_f9b76467f6b16682), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0e8f58f429bb1135: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_225e53f995988ddf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f602da97fc0ccdf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "threadId"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f71d438c15bfb32: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("history"), properties = mapOf("history" to schema_ab79b5853d26c3e7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0f732b9fceb2c6ac: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0fce2ade0199ca1d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("counter", "counterKind", "epoch", "sampleId", "scopeId"), properties = mapOf("counter" to schema_56aa0e45cbdce0d0, "counterKind" to schema_91a5d2d349991a6a, "epoch" to schema_56aa0e45cbdce0d0, "fresh" to schema_feeb8bb50144d96d, "model" to schema_bf0b727f7b1c6d07, "occurredAt" to schema_56aa0e45cbdce0d0, "sampleId" to schema_36fea325bf1aca70, "scopeId" to schema_36fea325bf1aca70, "turnId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_0fd7e0ac403d7916: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name"), properties = mapOf("description" to schema_2d0b6ec9f2b2decf, "id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70, "type" to schema_a5b7c88e398574a5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_10209383e3295873: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("edit")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_10fabc1a112a6531: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1bee38d9c4818c5f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_113b6f36094df840: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_97d27c4efa52f52a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_115555b2d2065a65: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("interrupted"), JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_118f67a0fa6bb27d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skills-sh"), JsonPrimitive("skills-directory")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12344c6d82d54c6d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_938414fbfa27a773, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_12ca2594dca47145: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path"), properties = mapOf("kind" to schema_15838a9e80c7867f, "path" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13324e3fec19e623: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("location", "manifestPath"), properties = mapOf("includeAgentChats" to schema_feeb8bb50144d96d, "location" to schema_080f9cc154af9e27, "manifestPath" to schema_36fea325bf1aca70, "transcriptDir" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_135f7ef79d6fe306: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(3.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1371f7bedcffbc2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_ab5271048956dc05), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13762c62f0c23527: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("seq", "type"), properties = mapOf("seq" to schema_56aa0e45cbdce0d0, "type" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_137e14636e0bc235: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7eb7e8f44a304273, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_138aa255cc332dba: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("updatedAt", "windows", "wsl"), properties = mapOf("updatedAt" to schema_36fea325bf1aca70, "windows" to schema_fbec4a9479c23d41, "wsl" to schema_fbec4a9479c23d41), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1399799a226dcc71: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_00b1d6328e3a57b5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_13f43aaaf56911fa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("browser"), JsonPrimitive("crossagents"), JsonPrimitive("chrome"), JsonPrimitive("computer-use"), JsonPrimitive("app-controls")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14221269d858a2f5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("key")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_142a10f7fa96667b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "shellId"), properties = mapOf("initialSize" to schema_55ee222c096690dc, "projectLocation" to schema_080f9cc154af9e27, "shellId" to schema_36fea325bf1aca70, "startInHome" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_14ac0689f2cc3ba8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"), properties = mapOf("accounts" to schema_195974ed118a4217, "aiActions" to schema_62392c6d6ccb4368, "availableAccounts" to schema_2c4b8c74e6940159, "device" to schema_26f96950d20651b3, "generatedAt" to schema_3d06117798bf5171, "identity" to schema_da76232259cbe6bb, "insights" to schema_d1beee40ea84d2e9, "mcps" to schema_8c71be0e7fdf9e1a, "models" to schema_195974ed118a4217, "modes" to schema_195974ed118a4217, "promptHeatmap" to schema_c1094a243b47f83c, "providers" to schema_195974ed118a4217, "scope" to schema_b99ee3af304513c2, "skills" to schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes" to schema_3d06117798bf5171, "totals" to schema_22f3597ef077b931), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_150828825a4ec4d6: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_95bca512ea5c155a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15179deb98a23815: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("payload", "requestId", "requestType", "threadId", "type"), properties = mapOf("payload" to schema_fd95a83e5b156564, "requestId" to schema_bf0b727f7b1c6d07, "requestType" to schema_c733570a5a247812, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_fcb2eed91b3e89ce), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1544bc59ff42b21c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("command", "id", "name"), properties = mapOf("command" to schema_36fea325bf1aca70, "icon" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15838a9e80c7867f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_15cae388d0cdd5b6: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("summary"), JsonPrimitive("full")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1709690cf0edf961: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("id" to schema_36fea325bf1aca70, "sentAt" to schema_80c415b6e27c6ebd, "type" to schema_fe79d48b8af45e7d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_174f77d24d01fc57: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7324613e41acced2, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_17b50a5a251b31ce: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("receivedAt", "type"), properties = mapOf("id" to schema_36fea325bf1aca70, "receivedAt" to schema_80c415b6e27c6ebd, "sentAt" to schema_80c415b6e27c6ebd, "type" to schema_d8768c073f68fc35), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_17c2b8a25332cd3a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("httpBaseUrl", "wsBaseUrl"), properties = mapOf("httpBaseUrl" to schema_6bb6e13415c8cbba, "wsBaseUrl" to schema_6bb6e13415c8cbba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_189279e83c3a2ce4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18a5d3fa6e42f4ef: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("branches" to schema_458a4508393abce2, "ghAvailable" to schema_feeb8bb50144d96d, "ref" to schema_83470ce63973b6e2, "refreshedAt" to schema_bf0b727f7b1c6d07, "status" to schema_c1d4a9f752e166b1, "worktrees" to schema_cd357f47aa772b6a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_18b29df576abb2b9: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("setupScript" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19030914d1c4d410: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("insert-text")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_195974ed118a4217: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9fe1fe9bbcff3ecd, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_197c2b8c01d7f4ed: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("authMethod" to schema_36fea325bf1aca70, "authenticatedAs" to schema_36fea325bf1aca70, "connectedProviders" to schema_7fdc1b397391e8f3, "organization" to schema_36fea325bf1aca70, "plan" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1994cc63e450a4bd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_80c415b6e27c6ebd, schema_feeb8bb50144d96d), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_19cc91cdde8419f3: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9edd0cfb1cd802d2, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1aa020e871f1c07e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("event")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b2373270569d6e5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("statuses"), properties = mapOf("statuses" to schema_745963f66484f8a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b3dc298a6f3cf15: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "tokens"), properties = mapOf("id" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "tokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1b7f16955dbf0b33: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("state"), properties = mapOf("state" to schema_ecc6edb6166acda9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1bee38d9c4818c5f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "id", "location", "name"), properties = mapOf("createdAt" to schema_36fea325bf1aca70, "disabled" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "lastDraftConfig" to schema_8277cc81c1103ae4, "location" to schema_080f9cc154af9e27, "name" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "scripts" to schema_51d89a5cbbb635e7, "searchSettings" to schema_3ccadafaab48b090, "workspaceId" to schema_bf0b727f7b1c6d07, "worktreeLocation" to schema_7eb7e8f44a304273), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1c2823e73ee0c1dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("owner", "platform", "repo", "url"), properties = mapOf("owner" to schema_bf0b727f7b1c6d07, "platform" to schema_9358a37bbc89d2ef, "repo" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1c58197f2405018b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("isDraft", "number", "state", "title", "url"), properties = mapOf("checksStatus" to schema_bf0b727f7b1c6d07, "isDraft" to schema_feeb8bb50144d96d, "number" to schema_3d06117798bf5171, "state" to schema_79fd49e14d0e7e17, "title" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1d8def7ed78e9628: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4878a3657a97dce6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1da6db5f13bd36e1: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(30000), maximum = 9007199254740991.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1da8031b611dee7d: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_18a5d3fa6e42f4ef, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1dbbfc3a2edfde6a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("access_token" to schema_36fea325bf1aca70, "path" to schema_84c6a19f87f29012), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1eaf563a1e9fa631: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rank"), JsonPrimitive("stars"), JsonPrimitive("recent"), JsonPrimitive("votes")), defaultValue = JsonPrimitive("rank"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f4518886240126e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("create")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1f6ff7bae56a790b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("host"), JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fa1b7f79d80e44d: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 5.0, maximum = 200.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_1fbc0e0d793ae9f1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("context.updated")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
