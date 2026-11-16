// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_274e069cdc933ee1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_275476f9b6055811: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repos"), properties = mapOf("repos" to schema_75b702ed8c9f54ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2778fa8937ac1709: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_b7ac3adaa07b7aa4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27790e6c4216ae5b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "id"), properties = mapOf("action" to schema_482c9282715722ac, "id" to schema_d855999aed5e6438), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2798cb9d2dca7539: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "result" to schema_6a2d40d38c4527c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_279eee1efa9da6c8: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 65535.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27aa97567424846c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path", "projectId"), properties = mapOf("kind" to schema_88444d52d400622b, "path" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27d9340da4120b27: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("rationale", "threadId"), properties = mapOf("rationale" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280719966e4ed3aa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"), properties = mapOf("maxActiveAgentSessions" to schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers" to schema_56aa0e45cbdce0d0, "maxActiveTerminalShells" to schema_56aa0e45cbdce0d0, "overloadRetryAfterMs" to schema_56aa0e45cbdce0d0, "refuseNewStarts" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280ab70e288f77f7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_38754692c8b5ebef, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_281d24bbbaa46745: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("approvalPolicy" to schema_bf0b727f7b1c6d07, "approvalsReviewer" to schema_bf0b727f7b1c6d07, "browserMcp" to schema_feeb8bb50144d96d, "chromeMcp" to schema_feeb8bb50144d96d, "computerUse" to schema_feeb8bb50144d96d, "contextSize" to schema_bf0b727f7b1c6d07, "crew" to schema_46a8742e5750f74f, "crossagentMcp" to schema_feeb8bb50144d96d, "effort" to schema_bf0b727f7b1c6d07, "executionEnvironment" to schema_4cd2587996458d8d, "fast" to schema_feeb8bb50144d96d, "importedFrom" to schema_3471186f1398f1d2, "mcpServerOverrides" to schema_6db96506f253ef73, "mode" to schema_01e21946e943d3eb, "model" to schema_36fea325bf1aca70, "pluginOverrides" to schema_6db96506f253ef73, "sandboxMode" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d, "workflows" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2840caeaedca16a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("thinking"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2843e0996b9986e5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities"), properties = mapOf("capabilities" to schema_9be4e34050076f08), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_285bccb254d08f83: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 64, items = schema_b1ddb87a9b03649a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28676b8ad2f0d233: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("check"), JsonPrimitive("command"), JsonPrimitive("git"), JsonPrimitive("install"), JsonPrimitive("list"), JsonPrimitive("package"), JsonPrimitive("search"), JsonPrimitive("view")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_288cf32acf26654a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("downloadBytes", "id", "installed", "languages", "name", "supportsLanguageDetection", "verified"), properties = mapOf("downloadBytes" to schema_78830b3d6ec86f55, "id" to schema_bf0b727f7b1c6d07, "installed" to schema_feeb8bb50144d96d, "languages" to schema_0f732b9fceb2c6ac, "name" to schema_bf0b727f7b1c6d07, "supportsLanguageDetection" to schema_feeb8bb50144d96d, "verified" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28ab5341451545c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop"), JsonPrimitive("mobile"), JsonPrimitive("tablet"), JsonPrimitive("browser"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28b9eff1da2232c5: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_97d27c4efa52f52a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_290453f28a433311: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId", "url"), properties = mapOf("kind" to schema_9063020a6c5ad8b3, "tabId" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_291e0a286efaf880: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("channel", "previewId", "version"), properties = mapOf("channel" to schema_3c702b70b3eb4220, "previewId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_293191bcff918e5a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "crews" to schema_91181085efd88304, "crossagentHiddenModels" to schema_86d5d72e84423420, "crossagentPausedProviders" to schema_0f732b9fceb2c6ac, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "prAutomationDefault" to schema_6df05d56a8273d4c, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_294ca0c3f20bda2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "httpsUrl" to schema_bf0b727f7b1c6d07, "isFork" to schema_feeb8bb50144d96d, "isPrivate" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "nameWithOwner" to schema_bf0b727f7b1c6d07, "owner" to schema_bf0b727f7b1c6d07, "pushedAt" to schema_bf0b727f7b1c6d07, "sshUrl" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2963caa14efb9573: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("check"), JsonPrimitive("format-files"), JsonPrimitive("git"), JsonPrimitive("install-packages"), JsonPrimitive("list"), JsonPrimitive("list-packages"), JsonPrimitive("package-config"), JsonPrimitive("package-manager"), JsonPrimitive("run"), JsonPrimitive("search")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_297655ba91f41fa6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action"), properties = mapOf("action" to schema_49834fb5a406b494), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29b52750e42441f8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7e8114c3dda52277, schema_b305c5dcc2d06cc2, schema_f6a941e10f9feb27, schema_38c5e1151393f6bd, schema_3c594c99571d82f9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29b593c001751a61: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_eb074c03321e3c7d, schema_2504426b5098e866), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29fba8fe9f5724e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("auth", "p256dh"), properties = mapOf("auth" to schema_36fea325bf1aca70, "p256dh" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a107f95a9dcf216: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "removedCompletedTurnAnchors", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "removedCompletedTurnAnchors" to schema_0f732b9fceb2c6ac, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_9d72555063ba9bd7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a150cae9967732a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("connectionId", "threadId"), properties = mapOf("connectionId" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a2641f29ae91ad5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("extractedAt", "sourceProvider", "sourceSessionId", "summary"), properties = mapOf("contentKind" to schema_5aa9e435f68d585e, "extractedAt" to schema_36fea325bf1aca70, "sourceProvider" to schema_36fea325bf1aca70, "sourceSessionId" to schema_36fea325bf1aca70, "summary" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a43ea36a62fa6ac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "error", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "error" to schema_5cb704413fbdf0b3, "latencyMs" to schema_56aa0e45cbdce0d0, "status" to schema_fd6258ac6546d705, "toolCount" to schema_499c88c1c549e934), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a5c67603fdb726c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("credentialRef" to schema_c223d7ef6abf4cfd, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "port" to schema_6db9f33ca9aa8b01, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2a65cef1bc5905f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a7c0f630028ad83: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a8bc62fab6ac143: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bootstrapMethods", "policy", "scopes", "sessionMethods"), properties = mapOf("bootstrapMethods" to schema_c8aab5b657a17f5e, "policy" to schema_995ee3e349270afe, "scopes" to schema_515482d2104d1efa, "sessionMethods" to schema_07a15b7253b914ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2ae8d538fe55c35d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_929ff57e1355048a, schema_fee1e07039137fc5, schema_475f45061f4eecab, schema_297655ba91f41fa6, schema_0aacda6901eb566b, schema_f8fde013f784c33d, schema_9501e4a8a718d07b, schema_5a9666a2c52a802f, schema_5ffdb22692f97bf9, schema_313744588ce712ec, schema_27790e6c4216ae5b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2aeaf8ab36ef2176: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"), properties = mapOf("conditions" to schema_7476e0bfbec07d05, "inputs" to schema_aa36e30f2962353e, "maxDepth" to schema_7aa755d21efd1447, "maxInputBytes" to schema_bed38fc7e15d070f, "maxItems" to schema_8580fa8375e39340, "maxNodes" to schema_1b1b9bdadcd8934d, "version" to schema_e6cfd13a746cd290), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b430316258b9c31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "nextCursor"), properties = mapOf("historyProjection" to schema_72a4409660da2b12, "items" to schema_5d3ac76d9a521e1d, "nextCursor" to schema_60e901bdbc3f78cd, "reads" to schema_4659e6d395f41e16, "runtimeNotice" to schema_1468dfe9a2db9c9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
