// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_d50d16380040f1f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("commands", "kind"), properties = mapOf("commands" to schema_174f77d24d01fc57, "kind" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d518d195e8d37ea6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entry", "version"), properties = mapOf("entry" to schema_29b593c001751a61, "version" to schema_cf69e7793fd482bf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d550ef9994fd388f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("input", "type"), properties = mapOf("input" to schema_2c0b30d69cd8870d, "type" to schema_64570e224963bb89), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d566f2fb6a8ab583: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("payload", "procedure"), properties = mapOf("payload" to schema_ca3d163bab055381, "procedure" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d576db41e56d6d9a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("run"), JsonPrimitive("edit"), JsonPrimitive("create"), JsonPrimitive("delete"), JsonPrimitive("search"), JsonPrimitive("view")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d581274b5086148c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "ghAvailable", "status", "worktrees"), properties = mapOf("branches" to schema_86a79adde4b9578a, "ghAvailable" to schema_78c0e367e5120eb3, "status" to schema_98139abfca5e2eda, "worktrees" to schema_694e88722e472029), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d585eadabc094972: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("powerOff")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d598182dcda51b91: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 4, items = schema_ddfc75c448050e22, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d59ce91ef6d00c30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_7d8b97db21aa7eb7, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d5e402f736e2ff98: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "snapshot"), properties = mapOf("kind" to schema_9e712b4f87e5beb0, "snapshot" to schema_7641767459026446), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d5ffe1a272cf6a0c: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bf9d1b72f36fb4df, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d61b01c8cb5f5718: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("portrait"), JsonPrimitive("landscapeLeft"), JsonPrimitive("upsideDown"), JsonPrimitive("landscapeRight")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d61b8c82caefd0af: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_db70082117210f49, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d653b34c4449e1c3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("saved")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d66267c393bb4ec4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "enabled", "id", "name", "timeoutMs", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_5296d6b04d46b630), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_d68bbd085678f807: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ref", "refreshedAt"), properties = mapOf("pullRequestKey" to schema_2d0b6ec9f2b2decf, "ref" to schema_725be166aa92607b, "refreshedAt" to schema_bf0b727f7b1c6d07, "sourceInfo" to schema_4864c5f65afc8a79, "status" to schema_c1d4a9f752e166b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6a8cd432c4887c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId"), properties = mapOf("fail" to schema_d2dd3595e1b5e5dc, "groupName" to schema_df704162f3d15808, "retire" to schema_7fe780499159088a, "threadId" to schema_36fea325bf1aca70, "worktree" to schema_9645658cf3b0cbb3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6b726f850f5dc81: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("prepare")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6e0ba68c8b32de4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("installed"), properties = mapOf("installed" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d6eb488668c53724: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("header", "inputDigest", "itemId", "status"), properties = mapOf("header" to schema_30ad8803c938c252, "inputDigest" to schema_ec221fdc1494d0b1, "itemId" to schema_36fea325bf1aca70, "status" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d72afeeef5ea550e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("streamable-http")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d73ffe960ceccb3f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("diff_comment")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d762e3c1cdffa8f0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("numTurns", "threadId"), properties = mapOf("config" to schema_281d24bbbaa46745, "numTurns" to schema_f58a8b771657d037, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d7851314b0afd031: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("native" to schema_feeb8bb50144d96d, "wsl" to schema_cda18ebe4af54c5c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d7cd89eba31b2e2a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1e2e59a6d1a7c057, schema_0de685fcf44d9686, schema_57cb887824dd9c8e, schema_dc890acec2e05dce, schema_eaec87ff9d264913), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d7cf7473af61f30a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sourceBranch", "worktreeLocation"), properties = mapOf("preserveLocalChanges" to schema_f8b6dd8128e8bfe0, "sourceBranch" to schema_36fea325bf1aca70, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d832acd230fbc919: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "credential", "desired", "environmentId", "label", "legacyConnectionIds", "revision", "runtime", "state", "target", "trust", "updatedAt"), properties = mapOf("childIdentity" to schema_1b0d78a3430b7087, "createdAt" to schema_56aa0e45cbdce0d0, "credential" to schema_d06f3ce55df8317d, "desired" to schema_abff99d05c43ad4c, "environmentId" to schema_d855999aed5e6438, "label" to schema_0c5d3d75e4ff2cec, "lastError" to schema_a03f50bc643a4820, "legacyConnectionIds" to schema_1e591a20b9e55743, "port" to schema_279eee1efa9da6c8, "revision" to schema_f58a8b771657d037, "runtime" to schema_83671e64288686fc, "state" to schema_2c13d2fc1c3e2e03, "target" to schema_a13200e46be7a2e6, "trust" to schema_ecde1f3c1f09bdc0, "updatedAt" to schema_56aa0e45cbdce0d0), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_d855999aed5e6438: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\$", format = "uuid", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d864f91b7c2dcff0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"), properties = mapOf("admitted" to schema_56aa0e45cbdce0d0, "cancellations" to schema_56aa0e45cbdce0d0, "checkout" to schema_164937b9a51028fa, "environments" to schema_2f4c1755c2d3a402, "long" to schema_164937b9a51028fa, "queueFullRefusals" to schema_56aa0e45cbdce0d0, "short" to schema_164937b9a51028fa, "slowFetches" to schema_56aa0e45cbdce0d0, "waitTimeoutRefusals" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8768c073f68fc35: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pong")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d89acaaa627e4845: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("folder", "path"), properties = mapOf("folder" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_d8ae5c3a60a788cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_a20681cb358b7044, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8b225d7de9ceec5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("terminal-output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8b98c802420b030: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind"), properties = mapOf("agentKind" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8c10d781ed40d8c: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_172d5c08125b0df4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d8c5ceac03247ddb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entry", "version"), properties = mapOf("entry" to schema_74fc41a249149142, "version" to schema_f8ba039a2f32fad1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d91d3ff007d07add: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 2048, format = "uri", unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("model-provider.valid-url"))
}

internal val schema_d92866345cd97821: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "latencyMs" to schema_56aa0e45cbdce0d0, "serverInfo" to schema_820293e02a103abf, "status" to schema_7ce40fcb9f4c6111, "toolCount" to schema_56aa0e45cbdce0d0, "tools" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d92fe09fa7f298ab: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("request.resolved")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d95fd60152159d7a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "prNumber", "projectId"), properties = mapOf("branch" to schema_36fea325bf1aca70, "includeReviewBundle" to schema_feeb8bb50144d96d, "kind" to schema_c975fc7daa5c30b3, "prNumber" to schema_23e05d248383ea40, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9640543f6c97ed9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("resync-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d983c015b3a1ad0b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects", "projectsNextCursor", "reads"), properties = mapOf("inventoryFrontier" to schema_36fea325bf1aca70, "projects" to schema_61efa8909f32b55e, "projectsNextCursor" to schema_df704162f3d15808, "reads" to schema_4659e6d395f41e16), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9b927ff80c17b5c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runs"), properties = mapOf("runs" to schema_280ab70e288f77f7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_d9ce53289df5afc3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("deviceId", "sessionId", "threadId"), properties = mapOf("deviceId" to schema_36fea325bf1aca70, "sessionId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da37aeddd0e606ac: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_a99c73e81a312991, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da482300f3faecc5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectId", "projectLocation"), properties = mapOf("projectId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da546ba4a0601e6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentId", "label"), properties = mapOf("agentId" to schema_36fea325bf1aca70, "attempt" to schema_56aa0e45cbdce0d0, "chat" to schema_1d8def7ed78e9628, "durationMs" to schema_56aa0e45cbdce0d0, "label" to schema_36fea325bf1aca70, "lastProgressAt" to schema_3d06117798bf5171, "lastToolName" to schema_bf0b727f7b1c6d07, "model" to schema_bf0b727f7b1c6d07, "phaseIndex" to schema_56aa0e45cbdce0d0, "phaseTitle" to schema_bf0b727f7b1c6d07, "promptPreview" to schema_bf0b727f7b1c6d07, "queuedAt" to schema_3d06117798bf5171, "resultPreview" to schema_bf0b727f7b1c6d07, "startedAt" to schema_3d06117798bf5171, "state" to schema_5a17efba356f5500, "tokens" to schema_56aa0e45cbdce0d0, "toolCalls" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da6565103c15b143: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^dwp1_[A-Za-z0-9_-]{43}\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da66851500474562: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath", "source"), properties = mapOf("kind" to schema_8793e380887b215f, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70, "source" to schema_76b2c94b29aad9b1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da74e89ba01e20fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notes"), properties = mapOf("guardedWrites" to schema_7f9f5a0d72de0d9a, "notes" to schema_48c9126ae761103f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da76232259cbe6bb: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("avatarColor", "handle", "name"), properties = mapOf("avatarColor" to schema_8f8e73cb353005a1, "handle" to schema_485fa06696a88681, "name" to schema_c8709e27df818d5b, "plan" to schema_485fa06696a88681), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da78bdce10e9cf0f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("cancelled")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_da9e94c933512927: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 50, items = schema_c52c624815ab6ea5, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dade9637aede6170: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("seq", "type"), properties = mapOf("epoch" to schema_8e43cad70cd70de7, "seq" to schema_56aa0e45cbdce0d0, "type" to schema_0200f968d21b338b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_daefe10db0766411: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authentication"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db70082117210f49: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2778fa8937ac1709, schema_66846085f373f57f, schema_4244283735615c22, schema_85d2dd31fd2f4872, schema_f92e78d2407b6f99, schema_c55a346c739cb16c, schema_1371f7bedcffbc2e, schema_996ce1c4e0b82a8b, schema_cdd89e732d29ca0e, schema_baf4f355dd2fd6ae, schema_7cccbb4b01b446c8, schema_15179deb98a23815, schema_e01133268267ec38, schema_2a107f95a9dcf216, schema_9da23fadb81a50e3, schema_d42bf49d95c024ab), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_db8efd22aa031937: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("url"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dba220fea45f4f88: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("author", "body", "id", "state"), properties = mapOf("author" to schema_a99c73e81a312991, "body" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "state" to schema_d2a18aed5ce077b0, "submittedAt" to schema_bf0b727f7b1c6d07, "url" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
