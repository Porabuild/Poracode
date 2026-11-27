// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_dc0f3a73422e770a: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 8, items = schema_f06b19c7fb38c63d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc69d1c3f1fc465e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("sourceScope"), properties = mapOf("sourceScope" to schema_6a2600edfb55d776), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_dc77588f48189c8c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("accessibility", "id", "input", "name", "platform", "state"), properties = mapOf("accessibility" to schema_feeb8bb50144d96d, "controls" to schema_312483d60c5a264f, "foldable" to schema_feeb8bb50144d96d, "id" to schema_97d85a5eaee82b97, "input" to schema_feeb8bb50144d96d, "name" to schema_f1deff8504bbc0a3, "platform" to schema_61e54b5f6751c7a6, "state" to schema_51b8dd645024c82d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc890acec2e05dce: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "version"), properties = mapOf("items" to schema_bbc648a6c540c254, "version" to schema_e6cfd13a746cd290), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc97711e2c23c867: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d66267c393bb4ec4, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dc99757951407418: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_ce6e21bdeb9c2f10, schema_3d188d85aa0799fe), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dcb895209e6467d1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("autoMerge", "headBranch", "prNumber", "projectId", "reviewScope", "watchEnabled"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "autoMerge" to schema_feeb8bb50144d96d, "config" to schema_f69100925fc0e774, "headBranch" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectId" to schema_36fea325bf1aca70, "reviewScope" to schema_464dbc5abe96a4c9, "watchEnabled" to schema_feeb8bb50144d96d, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("pr-watch.agent-required-when-enabled"))
}

internal val schema_dcbc5c3920ad5890: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 256, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("string.trim"))
}

internal val schema_dcf7bba14632f6b7: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 999.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ddc83cdddf708141: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 4096, items = schema_f58c7e25807a46fe, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ddec8c4a92583c0c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("search")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ddfa380e07db6515: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("notices"), properties = mapOf("maxBytes" to schema_23e05d248383ea40, "maxDecodeBytes" to schema_23e05d248383ea40, "notices" to schema_f67f6cbe63879b24), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ddfb574eab47db7e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("expiresAt", "ticket", "version"), properties = mapOf("expiresAt" to schema_80c415b6e27c6ebd, "ticket" to schema_da6565103c15b143, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ddfc75c448050e22: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "root"), properties = mapOf("path" to schema_66c1d4f45e673970, "root" to schema_8307883c8b15a39d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_de00765ac7659be8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_de13949691e24afd: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4545388132b77b29, schema_2130fba9cf5ae781, schema_abcfe9be3ea6f135), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_de2055b6e4e71688: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"), properties = mapOf("agentSettingsDefaults" to schema_cff1242509563941, "approvalPolicies" to schema_6d1b9ceb7012b646, "bypassPermissions" to schema_edbbbb70d0bea172, "contextSizeChangeReloadsSession" to schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents" to schema_feeb8bb50144d96d, "contextSizes" to schema_d0b10c04efa78c87, "crossagentMcpRouting" to schema_d1d29954f5424dc9, "defaultApprovalPolicy" to schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer" to schema_bf0b727f7b1c6d07, "defaultContextSize" to schema_bf0b727f7b1c6d07, "defaultEffort" to schema_bf0b727f7b1c6d07, "defaultHiddenModels" to schema_515482d2104d1efa, "defaultSandboxMode" to schema_bf0b727f7b1c6d07, "disabledSkillNames" to schema_515482d2104d1efa, "efforts" to schema_242a5ef77d1f8924, "fastDisabledReason" to schema_bf0b727f7b1c6d07, "fastModels" to schema_515482d2104d1efa, "liveInputMode" to schema_88480e7409f5bc30, "liveVoice" to schema_62c3e7fb25ff5c30, "mcpConfigSource" to schema_96776c817a074e1f, "mcpScope" to schema_65e6698fa7640db4, "modelContextSizes" to schema_e163a1a22234ae4f, "modelDefaultEfforts" to schema_e51d77fd6734b53a, "modelEfforts" to schema_b4a8e17084bc4fba, "modelFamilies" to schema_ae3b637db050db2a, "modelSubProvider" to schema_e51d77fd6734b53a, "models" to schema_6d1b9ceb7012b646, "modes" to schema_429303c2d6a42977, "presentationCapabilities" to schema_93a8d764db906e68, "presentationMode" to schema_c9a954a3af7049b0, "presentationModes" to schema_553c5c509350e4e7, "readsImageAttachmentsFromHost" to schema_feeb8bb50144d96d, "readsPdfAttachmentsFromHost" to schema_feeb8bb50144d96d, "reportsSkillCatalog" to schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput" to schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments" to schema_feeb8bb50144d96d, "runtimeLabel" to schema_36fea325bf1aca70, "sandboxModes" to schema_6d1b9ceb7012b646, "settingDefs" to schema_28b9eff1da2232c5, "showRuntimeLabelInPicker" to schema_feeb8bb50144d96d, "slashCommands" to schema_174f77d24d01fc57, "subProviders" to schema_d0b10c04efa78c87, "supportsDirectInput" to schema_a6ba34cd39bf30c5, "supportsOneShot" to schema_feeb8bb50144d96d, "supportsReadOnlyOneShotWorkspace" to schema_feeb8bb50144d96d, "supportsResume" to schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot" to schema_feeb8bb50144d96d, "thinkingModels" to schema_515482d2104d1efa, "threadTitleCommands" to schema_fe7aea0f55ed142e, "utilityRank" to schema_56aa0e45cbdce0d0, "workflowLabel" to schema_36fea325bf1aca70, "workflowModels" to schema_515482d2104d1efa), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_deb1944cf3b4364b: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 16, items = schema_85c1db78d5c7dc29, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_deb61378c1ff010b: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_cff1242509563941, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("agent-settings.strip-sensitive"))
}

internal val schema_debc0ac62b48b9e2: RemoteSchema by lazy {
    RemoteSchema(type = "number", maximum = 10.0, exclusiveMinimum = 0.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_decb92bc1a95364d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("runId", "transcriptDir"), properties = mapOf("name" to schema_3cdb2ff0de916278, "runId" to schema_85c1db78d5c7dc29, "summary" to schema_dfc3f3726c991dbe, "transcriptDir" to schema_bd85a52dd25effae), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ded6409c4e09c24c: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_6021714d61c0537e, schema_413c12edf5d50ad0, schema_5a7fa7d249c6bf30, schema_8fd899986e6ebd80, schema_bfc61ac710ca35a8, schema_c6137caf0119356f, schema_594d4a132e11afee, schema_5db21c63a6df83f9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_def077222ff95f67: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "capabilities", "installed", "kind", "label"), properties = mapOf("acpSessionEstablished" to schema_feeb8bb50144d96d, "authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "capabilities" to schema_de2055b6e4e71688, "envDistro" to schema_bf0b727f7b1c6d07, "envKind" to schema_9eed5c4959909cfe, "executablePath" to schema_bf0b727f7b1c6d07, "icon" to schema_bf0b727f7b1c6d07, "installed" to schema_feeb8bb50144d96d, "kind" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationAuthStates" to schema_678d084ee287670a, "presentationAuthUsesProviderLogin" to schema_473e9b7f4728cf72, "providerMetadata" to schema_197c2b8c01d7f4ed, "runtimeVariants" to schema_5376f6dc7a23015e, "sessionRuntimeRouting" to schema_d221b1853eb0ef37, "update" to schema_892eceb2acf00deb, "version" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df0bab02c94f0c14: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind"), properties = mapOf("agentKind" to schema_7d62681c6488867d, "crewRoleId" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df37d0da6ffc8371: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("title"), properties = mapOf("title" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_df5d50a7515a4b30: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("archiveUnusedDays", "captureCustomMinutes", "captureEffort", "captureFast", "captureModel", "captureProvider", "captureTiming", "deletePolicy", "dreamCadence", "dreamEffort", "dreamFast", "dreamModel", "dreamProvider", "enabled", "learning", "sessionTokenBudget", "skillThreshold", "suggestSkills", "suppressNative", "syncEnabled"), properties = mapOf("archiveUnusedDays" to schema_d0bd9c5c0fa9bf37, "captureCustomMinutes" to schema_8db449fef3c951c4, "captureEffort" to schema_38d1a07d3b9b1c82, "captureFast" to schema_f8b6dd8128e8bfe0, "captureModel" to schema_38d1a07d3b9b1c82, "captureProvider" to schema_39f6d5287a718cd5, "captureTiming" to schema_b0eed3c52a70f213, "deletePolicy" to schema_b5556f3ec1f82cb8, "dreamCadence" to schema_51fc9e063590d3e3, "dreamEffort" to schema_38d1a07d3b9b1c82, "dreamFast" to schema_f8b6dd8128e8bfe0, "dreamModel" to schema_38d1a07d3b9b1c82, "dreamProvider" to schema_39f6d5287a718cd5, "enabled" to schema_f8b6dd8128e8bfe0, "learning" to schema_a6ba34cd39bf30c5, "sessionTokenBudget" to schema_0579a31094a2b8a7, "skillThreshold" to schema_0013f55d4acc3d55, "suggestSkills" to schema_a6ba34cd39bf30c5, "suppressNative" to schema_f8b6dd8128e8bfe0, "syncEnabled" to schema_a6ba34cd39bf30c5), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_dfb0d1c56206a71e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("nextCursor", "runtimeSummariesByThread", "threads"), properties = mapOf("gitSummariesByThread" to schema_aca97eda78815baa, "inventoryFrontier" to schema_36fea325bf1aca70, "nextCursor" to schema_2d0b6ec9f2b2decf, "reads" to schema_4659e6d395f41e16, "runtimeSummariesByThread" to schema_fc9d6f4c2617a24d, "threads" to schema_315e9038603a0581), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dfbf83bd7409c8d7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("latitude", "longitude", "type"), properties = mapOf("latitude" to schema_3a762c9b6eacc492, "longitude" to schema_f1261de365f15bea, "type" to schema_1a0723da99007052), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_dfc3f3726c991dbe: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 4096, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_dfdd62dd3d4c4d45: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("email" to schema_36fea325bf1aca70, "name" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_dffaae382198f79c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "resolution", "usage"), properties = mapOf("gitProcesses" to schema_d864f91b7c2dcff0, "policy" to schema_280719966e4ed3aa, "resolution" to schema_c0edab91e2f5d96e, "usage" to schema_1618be77eba1d732), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e005a5ac28cf7191: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_ee4a36083d770366, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e01133268267ec38: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("outcome", "requestId", "threadId", "type"), properties = mapOf("outcome" to schema_506f036707472345, "requestId" to schema_bf0b727f7b1c6d07, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_d92fe09fa7f298ab), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e07628c606344153: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("workflow"), properties = mapOf("workflow" to schema_decb92bc1a95364d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0bc631a257fd15a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("device", "identity"), properties = mapOf("device" to schema_26f96950d20651b3, "identity" to schema_da76232259cbe6bb), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0da1e0a5e3cd077: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("headers", "type", "url"), properties = mapOf("headers" to schema_c3ac2139868061bb, "type" to schema_4f84b56b06f60ea1, "url" to schema_7ac95086b2ca282e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.valid-url"))
}

internal val schema_e0e12d4798687ab0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("codec", "transport"), properties = mapOf("codec" to schema_a8565e7811b17010, "transport" to schema_4f84b56b06f60ea1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e0fa095c6a9a1aed: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("categories", "categorizedTokens", "estimatedSamples", "estimatedTokens", "estimatedUsd", "observed", "observedSamples", "observedTokens", "tokens", "unpricedTokens"), properties = mapOf("cacheSavingsUsd" to schema_f696f11685898ba7, "categories" to schema_e70be7a06d8baea6, "categorizedTokens" to schema_56aa0e45cbdce0d0, "categoryCostUsd" to schema_5e0b4ff187f93bea, "estimatedSamples" to schema_56aa0e45cbdce0d0, "estimatedTokens" to schema_56aa0e45cbdce0d0, "estimatedUsd" to schema_f696f11685898ba7, "observed" to schema_c8ef822f0af9edc7, "observedSamples" to schema_56aa0e45cbdce0d0, "observedTokens" to schema_56aa0e45cbdce0d0, "tokens" to schema_56aa0e45cbdce0d0, "unpricedTokens" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e105701b122113cd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("descriptor", "notice", "outcome", "supersededAcceptedEvents"), properties = mapOf("descriptor" to schema_c66f09c6212330ba, "notice" to schema_1468dfe9a2db9c9d, "outcome" to schema_c62b342ed89c5809, "supersededAcceptedEvents" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e163a1a22234ae4f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e1a91348d83820fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("events")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e1b186e0802b07d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("installedAt", "target", "version"), properties = mapOf("installedAt" to schema_bf0b727f7b1c6d07, "layoutVersion" to schema_23e05d248383ea40, "target" to schema_36fea325bf1aca70, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e1b513bc9f0b4f9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e213e5cbde87bf9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("hostKeyFingerprint", "state"), properties = mapOf("hostKeyFingerprint" to schema_d3359b6d5db5b90d, "observedFingerprint" to schema_d3359b6d5db5b90d, "state" to schema_eaed5114fa77917e), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_e22de6db69f83369: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^[A-Z]{3}\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e25509dad8a191fe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("empty"), JsonPrimitive("generating"), JsonPrimitive("ready"), JsonPrimitive("failed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e2d96ee09e9d99a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "projectId"), properties = mapOf("branch" to schema_36fea325bf1aca70, "includePrDetails" to schema_feeb8bb50144d96d, "kind" to schema_fc779c522d442c13, "projectId" to schema_36fea325bf1aca70, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e301e52cd3d3ea46: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, pattern = "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e30d1bfa71891ffd: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "repoIdentities"), properties = mapOf("kind" to schema_75d835115fd0d1f9, "projectId" to schema_36fea325bf1aca70, "repoIdentities" to schema_deb1944cf3b4364b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3219bd3e5cadaaa: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("invalid-config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e333e5cd970cf11f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_109baa93f8b988b2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e356e4b5f6808673: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_343472a6ca61672a, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e37012a6e5cb600d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("websocket")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e374b6098906e936: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_e1b186e0802b07d2, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e391f3a6d93daf46: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("entries", "tombstones"), properties = mapOf("entries" to schema_829800d9c06a4277, "tombstones" to schema_a74e5d4eb4c9f711), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e39d2c7b7e26e3b5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("source"), properties = mapOf("context" to schema_0f2003aeafbcbd0b, "label" to schema_d576db41e56d6d9a, "labelChoice" to schema_4b51a86edb3e38b1, "path" to schema_feeb8bb50144d96d, "source" to schema_0f2003aeafbcbd0b), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3b2f0593652d957: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("available"), properties = mapOf("available" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3c6a49a61116efe: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("user"), JsonPrimitive("feedback"), JsonPrimitive("project"), JsonPrimitive("reference")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e3fc8b89f137aafe: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 1000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e41b25797ed24d45: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"), properties = mapOf("expectedWorktreeCommit" to schema_bb2e0e6d90c93ccf, "projectLocation" to schema_080f9cc154af9e27, "sourceBranch" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70, "worktreeLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e42ea2046849510b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "text"), properties = mapOf("kind" to schema_988852db0cf6d4ed, "text" to schema_7673f46694e3b986), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e43da4fadbe84794: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("blocks"), properties = mapOf("blocks" to schema_51379d96383df5ba), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e47ad2358cf0df53: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_80ac3a097b3c79c7, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e484765a09e242ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentId"), properties = mapOf("agentId" to schema_36fea325bf1aca70, "target" to schema_2583fd799237ae71), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4a434d61cd0f65f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("minutes"), JsonPrimitive("hours"), JsonPrimitive("days")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4b74b1dc0c53202: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 80, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4bc158e23fda03f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_f6cdfe506c1e5468, schema_9d0b458ecda8044b, schema_bdd9db2d94de6e62), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e4ed0fc98f59d7f1: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 1000, items = schema_d832acd230fbc919, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_e52b25f4a021269e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursor", "notices", "reads"), properties = mapOf("afterSeq" to schema_56aa0e45cbdce0d0, "cursor" to schema_bd85a52dd25effae, "deferBodies" to schema_30a537a9343bcdf7, "maxBytes" to schema_23e05d248383ea40, "maxDecodeBytes" to schema_23e05d248383ea40, "notices" to schema_f67f6cbe63879b24, "omitScrollback" to schema_feeb8bb50144d96d, "projection" to schema_72a4409660da2b12, "reads" to schema_4659e6d395f41e16, "targetTimelineEntryCount" to schema_f9e7f90793023053), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e56382aee3ea3c7f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "workflowId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "inputs" to schema_fd056ca894e30f21, "projectLocation" to schema_080f9cc154af9e27, "ref" to schema_36fea325bf1aca70, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e5b87d3305643fab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("outdated", "server", "status", "target", "terminal"), properties = mapOf("id" to schema_36fea325bf1aca70, "latestVersion" to schema_36fea325bf1aca70, "outdated" to schema_feeb8bb50144d96d, "server" to schema_feeb8bb50144d96d, "status" to schema_0488c0e7c6c7a315, "target" to schema_36fea325bf1aca70, "terminal" to schema_feeb8bb50144d96d, "updating" to schema_feeb8bb50144d96d, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e5bbd3e940039349: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 200, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, transformIds = listOf("string.trim"))
}

internal val schema_e5c9a0e5d29c7881: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("catalogs", "installations"), properties = mapOf("artwork" to schema_9d92cfef95052445, "catalogs" to schema_2d4addb19c77f86e, "inspection" to schema_154f4d228a56e6d2, "installations" to schema_eb004d9898978907), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_e5d4267d1db7cbbf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("first-class"), JsonPrimitive("generic")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e5ee0a072228c0a3: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("once")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6958017dac6cd3b: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_ca3d163bab055381, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6bc2fd97be6dec8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none"), JsonPrimitive("view"), JsonPrimitive("control")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6cfd13a746cd290: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(4.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6da2ef0eeb6a138: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "baseBranch", "branch", "projectLocation"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "baseBranch" to schema_36fea325bf1aca70, "branch" to schema_36fea325bf1aca70, "language" to schema_36fea325bf1aca70, "projectLocation" to schema_080f9cc154af9e27, "selection" to schema_32c3720f649f40a1), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e6e7f052c94d0214: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_3e321589391fc1f4, schema_d8c5ceac03247ddb, schema_d518d195e8d37ea6), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e70be7a06d8baea6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cacheRead", "cacheWrite", "input", "output"), properties = mapOf("cacheRead" to schema_56aa0e45cbdce0d0, "cacheWrite" to schema_56aa0e45cbdce0d0, "cacheWrite1h" to schema_56aa0e45cbdce0d0, "input" to schema_56aa0e45cbdce0d0, "output" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e727dd4d36779347: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("baseURL", "id", "name"), properties = mapOf("baseURL" to schema_bf0b727f7b1c6d07, "id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e761211b82c40573: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("servers"), properties = mapOf("servers" to schema_dc97711e2c23c867), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e788b86a30c28e0d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path"), properties = mapOf("path" to schema_36fea325bf1aca70, "ticket" to schema_36fea325bf1aca70, "variant" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_e7c7f30aecaa99f0: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 500, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e7cab2d2c052144f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "kind"), properties = mapOf("id" to schema_d855999aed5e6438, "kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e80087031872d26b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("confidenceThreshold", "kind", "stopWhen"), properties = mapOf("confidenceThreshold" to schema_5d4b39004bf5c532, "kind" to schema_5bbcf9e4750fbaa3, "stopWhen" to schema_5c6957eaa59e2ae2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e8296209cb9a16ca: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "phase"), properties = mapOf("id" to schema_d855999aed5e6438, "phase" to schema_38efdc386b3577e7, "progress" to schema_a581e67cd137ad59, "supportsWait" to schema_d2dd3595e1b5e5dc, "transcript" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_e8ae3938f73bbe3d: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 16000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e8eddc5ea5c6c929: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("result", "version", "watchId"), properties = mapOf("result" to schema_5fa6bc3b9f97abd5, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e96ebdc8b8af5200: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27, "rebase" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e987f23b082616d2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("A"), JsonPrimitive("B"), JsonPrimitive("C"), JsonPrimitive("D"), JsonPrimitive("F")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9b9e3e75ffe2b01: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("process", "remote"), properties = mapOf("hostResourceAdmission" to schema_dffaae382198f79c, "process" to schema_9f6e05a566c74be3, "remote" to schema_99cf08bb5da33962), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_e9d06fff5d247f24: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("archive"), JsonPrimitive("delete")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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
