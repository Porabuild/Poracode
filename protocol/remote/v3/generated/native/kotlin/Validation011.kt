// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_ddfa380e07db6515: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("maxBytes" to schema_23e05d248383ea40, "maxDecodeBytes" to schema_23e05d248383ea40, "notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_de00765ac7659be8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_de13949691e24afd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4545388132b77b29, schema_2130fba9cf5ae781, schema_abcfe9be3ea6f135), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_deb61378c1ff010b: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_cff1242509563941, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("agent-settings.strip-sensitive"))
}

internal val schema_deb900b573030f10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("details"), properties = mapOf("details" to schema_4f71723712c92064, "pr" to schema_912ced4bf8efe6b6), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df37d0da6ffc8371: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("title"), properties = mapOf("title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df704162f3d15808: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_36fea325bf1aca70, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df7fa3d1be8ffbea: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("checkpoints", "turns"), properties = mapOf("checkpoints" to schema_12344c6d82d54c6d, "turns" to schema_203e1407dc2d843e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df96bd315b4c0dae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("anchorItemId", "endedAt", "startedAt"), properties = mapOf("anchorItemId" to schema_2d0b6ec9f2b2decf, "endedAt" to schema_36fea325bf1aca70, "startedAt" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dfc3f3726c991dbe: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 4096, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e005a5ac28cf7191: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ee4a36083d770366, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e01133268267ec38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("outcome", "requestId", "threadId", "type"), properties = mapOf("outcome" to schema_506f036707472345, "requestId" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_d92fe09fa7f298ab), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0bc631a257fd15a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "identity"), properties = mapOf("device" to schema_26f96950d20651b3, "identity" to schema_da76232259cbe6bb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0da1e0a5e3cd077: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_e0fc3c3d350deb38: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_191ccdb4e41abc75, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e105701b122113cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("descriptor", "notice", "outcome", "supersededAcceptedEvents"), properties = mapOf("descriptor" to schema_c66f09c6212330ba, "notice" to schema_1468dfe9a2db9c9d, "outcome" to schema_c62b342ed89c5809, "supersededAcceptedEvents" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e163a1a22234ae4f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e187f0f0022475a3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation", "threadId"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "ensureRunning" to schema_d2dd3595e1b5e5dc, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_a22ff042f4e542fc, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e1a91348d83820fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("events")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e213e5cbde87bf9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostKeyFingerprint", "state"), properties = mapOf("hostKeyFingerprint" to schema_d3359b6d5db5b90d, "observedFingerprint" to schema_d3359b6d5db5b90d, "state" to schema_eaed5114fa77917e), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_e22de6db69f83369: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[A-Z]{3}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e26989c54e256c6f: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("approvalPolicies" to schema_d0b10c04efa78c87, "bypassPermissions" to schema_97dee2d4960c1271, "contextSizeChangeReloadsSession" to schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents" to schema_feeb8bb50144d96d, "contextSizes" to schema_d0b10c04efa78c87, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_515482d2104d1efa, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_cb81a9dbb81a1a63, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_e163a1a22234ae4f, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_d0b10c04efa78c87, "modes" to schema_acf85c3d3b25a389, "presentationMode" to schema_6508684ba659826b, "presentationModes" to schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_d0b10c04efa78c87, "settingDefs" to schema_113b6f36094df840, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_feeb8bb50144d96d, "supportsResume" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e2d96ee09e9d99a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("branch" to schema_36fea325bf1aca70, "includePrDetails" to schema_feeb8bb50144d96d, "kind" to schema_fc779c522d442c13, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e301e52cd3d3ea46: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, pattern = "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e333e5cd970cf11f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_109baa93f8b988b2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3b2f0593652d957: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("available"), properties = mapOf("available" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3fc8b89f137aafe: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 1000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e41b25797ed24d45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"), properties = mapOf("expectedWorktreeCommit" to schema_bb2e0e6d90c93ccf, "projectLocation" to schema_080f9cc154af9e27, "sourceBranch" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e47ad2358cf0df53: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_80ac3a097b3c79c7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4a434d61cd0f65f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("minutes"), JsonPrimitive("hours"), JsonPrimitive("days")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4ed0fc98f59d7f1: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 1000, items = schema_d832acd230fbc919, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e5051103ac533240: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_912ced4bf8efe6b6, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e510e581c4f8b523: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "payload"), properties = mapOf("kind" to schema_ffc64b31e09ad873, "payload" to schema_626f8596f7256857), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e51d77fd6734b53a: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e527c3ee29cd639b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("auth-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e56382aee3ea3c7f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "workflowId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "inputs" to schema_fd056ca894e30f21, "projectLocation" to schema_080f9cc154af9e27, "ref" to schema_36fea325bf1aca70, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e5bbd3e940039349: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 200, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("string.trim"))
}

internal val schema_e5ee0a072228c0a3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("once")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e65689e97e7d91c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_9dd9855628dd71ae, "id" to schema_36fea325bf1aca70, "type" to schema_114549e732be9b99), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6958017dac6cd3b: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_ca3d163bab055381, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6cfd13a746cd290: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(4.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6da2ef0eeb6a138: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "baseBranch", "branch", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "baseBranch" to schema_36fea325bf1aca70, "branch" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e70be7a06d8baea6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cacheRead", "cacheWrite", "input", "output"), properties = mapOf("cacheRead" to schema_56aa0e45cbdce0d0, "cacheWrite" to schema_56aa0e45cbdce0d0, "cacheWrite1h" to schema_56aa0e45cbdce0d0, "input" to schema_56aa0e45cbdce0d0, "output" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e761211b82c40573: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("servers"), properties = mapOf("servers" to schema_dc97711e2c23c867), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e78ddc126c04f09d: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 64000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e78f40fc5399f7f1: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 200, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e7c244bd461f7229: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_93ea7778107ef974, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e7cab2d2c052144f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e80087031872d26b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("confidenceThreshold", "kind", "stopWhen"), properties = mapOf("confidenceThreshold" to schema_5d4b39004bf5c532, "kind" to schema_5bbcf9e4750fbaa3, "stopWhen" to schema_5c6957eaa59e2ae2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e82ae39cda9f878d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_f9e7f90793023053, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e841af2cbd75708d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("toggle")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e847e321fbb6435b: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e86709003d111155: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "questionAnswer" to schema_a22ff042f4e542fc, "segments" to schema_4392338ffc80bed7, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e8fbf0f2cbb425a8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_20d706a189398fff, schema_37eeca9f5377b6e4, schema_66021940878f3abc, schema_7a00457b3e3294c1, schema_81440643a0f1796d), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e96ebdc8b8af5200: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27, "rebase" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e987f23b082616d2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("A"), JsonPrimitive("B"), JsonPrimitive("C"), JsonPrimitive("D"), JsonPrimitive("F")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9df8b4f3dcc8aae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("flowId"), properties = mapOf("flowId" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9e7b28a3dddd9fd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("enabled", "id", "name", "timeoutMs", "transport"), properties = mapOf("enabled" to schema_feeb8bb50144d96d, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_23e05d248383ea40, "transport" to schema_5296d6b04d46b630, "unsupportedReason" to schema_2556bf4896893601), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9f57f9b4751d6e1: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 3600.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea08f63f22aa2011: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_3a38f5dc8038f065, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea193ab85993872c: RemoteSchema by lazy {
    RemoteSchema(type = "integer", defaultValue = JsonPrimitive(5), minimum = 2.0, maximum = 120.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea3d1d70c1876de4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("account", "runtime"), properties = mapOf("account" to schema_5646cf57ff3aebe0, "runtime" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ea993e5b2d87f77f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("detected", "forwards"), properties = mapOf("detected" to schema_58c75b9ad5972758, "forwards" to schema_2c93150c89b253f9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaa8e54151cd7fc2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket"), properties = mapOf("expiresAt" to schema_36fea325bf1aca70, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaed3cfbf46d5d81: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("github"), JsonPrimitive("gitlab"), JsonPrimitive("forgejo"), JsonPrimitive("gitea"), JsonPrimitive("bitbucket"), JsonPrimitive("azure-devops"), JsonPrimitive("gitcafe")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaed5114fa77917e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pinned")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eaf8a91849801b20: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("status"), properties = mapOf("content" to schema_bf0b727f7b1c6d07, "modifiedAtMs" to schema_f696f11685898ba7, "status" to schema_949f0ec1c2b67829), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb12aad2875e1908: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "runId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "runId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb148d7195a1780a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("downloaded")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2405f61baf028b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bytesPerSecond", "percent", "total", "transferred", "type"), properties = mapOf("bytesPerSecond" to schema_80c415b6e27c6ebd, "percent" to schema_80c415b6e27c6ebd, "total" to schema_80c415b6e27c6ebd, "transferred" to schema_80c415b6e27c6ebd, "type" to schema_bd136ee4bcce8b07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb2798e2ccc8bf65: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_5646cf57ff3aebe0, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eb5b966723ac7023: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentKind" to schema_36fea325bf1aca70, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "wslDistro" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebd70a208b453fe1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "starred"), properties = mapOf("kind" to schema_833ef472e7760fae, "starred" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ebfa6f1c64210a5f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId", "workspaceId"), properties = mapOf("kind" to schema_96cd458fa9bae303, "projectId" to schema_36fea325bf1aca70, "workspaceId" to schema_df704162f3d15808), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec221fdc1494d0b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[a-f0-9]{64}$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec438f4fd047a2a3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_2c97b9d429a794cb, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ec76fa076d16485a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "version"), properties = mapOf("type" to schema_eb148d7195a1780a, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecbd7591c9493c90: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("diff"), properties = mapOf("diff" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecc6edb6166acda9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("activeTabId", "tabs"), properties = mapOf("activeTabId" to schema_2d0b6ec9f2b2decf, "tabs" to schema_bf3a4ed0e5798352), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecde1f3c1f09bdc0: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_1fb6f9ae5f6d1a02, schema_6f5cce5ce127f97f, schema_e213e5cbde87bf9f), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ecf46d016507c672: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("BEHIND"), JsonPrimitive("BLOCKED"), JsonPrimitive("CLEAN"), JsonPrimitive("DIRTY"), JsonPrimitive("DRAFT"), JsonPrimitive("HAS_HOOKS"), JsonPrimitive("UNKNOWN"), JsonPrimitive("UNSTABLE")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ed1865d937c91a50: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("move-tab")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ed3d9773342dac2c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries"), properties = mapOf("entries" to schema_bdb4eecbb625c500), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee4a36083d770366: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "prompt", "stagedAt"), properties = mapOf("id" to schema_36fea325bf1aca70, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "stagedAt" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee5346688873f70f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_af9e7187ee39d2c1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee6af1c3c62ad32f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("slash"), JsonPrimitive("dollar"), JsonPrimitive("prompt"), JsonPrimitive("skill")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ee8a6a87417deae2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok", "revision"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_eeb5c5f788e7f258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("filePath", "projectLocation", "staged"), properties = mapOf("filePath" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "staged" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef7ac92f549d928c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("decision", "prNumber", "projectLocation"), properties = mapOf("body" to schema_38d1a07d3b9b1c82, "decision" to schema_c0551fbf082fff0f, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ef917452dcccd356: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("tap")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efc124973b411d28: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("failed"), JsonPrimitive("skipped_no_location"), JsonPrimitive("skipped_missing_checkpoint")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efd9410c7543c4c0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "placement", "projectId", "targetThreadId"), properties = mapOf("kind" to schema_8e7b4d097aa71417, "placement" to schema_3512bd687eb85e90, "projectId" to schema_36fea325bf1aca70, "targetThreadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_efedb06a4d7088a5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "name", "options", "required", "type"), properties = mapOf("defaultValue" to schema_1994cc63e450a4bd, "description" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07, "options" to schema_0f732b9fceb2c6ac, "required" to schema_feeb8bb50144d96d, "type" to schema_f450768848c5befd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f04c7b0573aff59c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_5d5cc3aa0a1f3291), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f0c513c0146099c2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("publicKey"), properties = mapOf("publicKey" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f145218b6dee66b6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("code", "message"), properties = mapOf("authScheme" to schema_2d52ff1140653b18, "code" to schema_e527c3ee29cd639b, "message" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f156a9bc12c3639a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("running"), JsonPrimitive("exited")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1666190cd652261: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 500, items = schema_ad1d9fe8b3eda038, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1a8832c8ce43a2f: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4e1c353012bcb7ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f1c1581e1729d48e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("event", "seq", "type"), properties = mapOf("event" to schema_ca3d163bab055381, "seq" to schema_23e05d248383ea40, "space" to schema_22c1b4b934fdb197, "type" to schema_829c74ec0aec2226), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f22a438b8392693b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name", "threadId"), properties = mapOf("name" to schema_9bc1c08248602f5c, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f252df24b49da178: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("current", "outcome"), properties = mapOf("current" to schema_f550638b8241897c, "outcome" to schema_41148a177ba98c21), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2b9759b60404656: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("force" to schema_feeb8bb50144d96d, "providerIds" to schema_0f732b9fceb2c6ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2bb61aa3bb8d258: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("label", "optionId"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "label" to schema_bf0b727f7b1c6d07, "optionId" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2d54b0f9e07d90a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("old"), JsonPrimitive("new")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f2e3da83f3088e10: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_04569d9eea76ae2b, "result" to schema_51cc694dc5da9f2a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f30731ffd8c57b5c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("content.delta")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f30afbf29e9d6e24: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "record", "threads"), properties = mapOf("kind" to schema_1f4518886240126e, "record" to schema_1be5ac91cc4357cb, "threads" to schema_4d7f9a55217d713f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f34e1c0e37ed0c00: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("message", "projectLocation"), properties = mapOf("addAll" to schema_f8b6dd8128e8bfe0, "message" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "reapplyStashCommit" to schema_bb2e0e6d90c93ccf), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f355c9e66a3091a2: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_f399af5f8dcf6035: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("set-group")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
