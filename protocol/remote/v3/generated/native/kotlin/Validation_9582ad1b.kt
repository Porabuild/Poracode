// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_b2d5bb9fac49f2fc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("condition", "confidence", "evaluatedAt", "reason", "stopMatched"), properties = mapOf("condition" to schema_5c6957eaa59e2ae2, "confidence" to schema_5d4b39004bf5c532, "evaluatedAt" to schema_38adcf16c79023ce, "reason" to schema_89c223893a706cf8, "stopMatched" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b305c5dcc2d06cc2: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^gemini:.+", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b313ad72a5d78585: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("resourceUri", "sessionId", "toolName", "version"), properties = mapOf("resourceUri" to schema_1d58a09e28f725df, "sessionId" to schema_d855999aed5e6438, "toolName" to schema_97d85a5eaee82b97, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b37f60804aab420f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"), properties = mapOf("activeTurnStartedAt" to schema_36fea325bf1aca70, "additionalDirectories" to schema_98d52bd55e800515, "agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "archived" to schema_f8b6dd8128e8bfe0, "archivedAt" to schema_36fea325bf1aca70, "attention" to schema_58edfaf9f73b8db4, "canResumeWithConfig" to schema_f8b6dd8128e8bfe0, "config" to schema_281d24bbbaa46745, "createdAt" to schema_36fea325bf1aca70, "done" to schema_f8b6dd8128e8bfe0, "doneAt" to schema_36fea325bf1aca70, "errorMessage" to schema_bf0b727f7b1c6d07, "forkedFrom" to schema_f48ab668e0f88dac, "groupId" to schema_bf0b727f7b1c6d07, "groupName" to schema_bf0b727f7b1c6d07, "id" to schema_36fea325bf1aca70, "interruptedTurn" to schema_2127b6212a816df5, "lastTurnEndedAt" to schema_36fea325bf1aca70, "lastTurnStartedAt" to schema_36fea325bf1aca70, "parentThreadId" to schema_36fea325bf1aca70, "prNumber" to schema_80c415b6e27c6ebd, "presentationMode" to schema_6508684ba659826b, "projectId" to schema_36fea325bf1aca70, "remoteId" to schema_36fea325bf1aca70, "remoteServerId" to schema_36fea325bf1aca70, "sessionConfigOptions" to schema_9b050dd4848ae8c2, "sessionRef" to schema_25df6feb29c4a959, "slashCommands" to schema_174f77d24d01fc57, "starred" to schema_f8b6dd8128e8bfe0, "status" to schema_8c61ed237d0ab3d0, "threadStatusSource" to schema_8f739487924008df, "title" to schema_36fea325bf1aca70, "updatedAt" to schema_36fea325bf1aca70, "workspaceGrantRevision" to schema_56aa0e45cbdce0d0, "workspaceId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3a77940d8c895cb: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 1024, items = schema_6beecd6e512e8794, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b3ef93117a9f9f95: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("portrait"), JsonPrimitive("landscape_left"), JsonPrimitive("portrait_upside_down"), JsonPrimitive("landscape_right")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b414b8c354764ff5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("plugin"), JsonPrimitive("component-type"), JsonPrimitive("skill"), JsonPrimitive("mcp-server")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b426243b004ca830: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4441316f1aafac9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "labelKey", "options"), properties = mapOf("id" to schema_36fea325bf1aca70, "labelKey" to schema_36fea325bf1aca70, "options" to schema_1d53b68fd3881a00), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b445f14c3106fc97: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_288cf32acf26654a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b4a8e17084bc4fba: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b53074e6b68baa67: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"), properties = mapOf("contentType" to schema_36fea325bf1aca70, "expiresAt" to schema_36fea325bf1aca70, "modifiedAtMs" to schema_f696f11685898ba7, "sizeBytes" to schema_56aa0e45cbdce0d0, "ticket" to schema_7f27390751296eea), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5556f3ec1f82cb8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("spool"), JsonPrimitive("lifecycle"), JsonPrimitive("never")), defaultValue = JsonPrimitive("spool"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b588ef57ebadea7a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_4ec1d31e87eeb7a4, schema_a93427ae1fb25d32), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5a9f6bbb8f67f9f: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("npm"), JsonPrimitive("homebrew-cask"), JsonPrimitive("version-url"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5b89821dbf7fe4a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_c33cd4031b7f99e0, schema_e6958017dac6cd3b), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5c1f44eaf04477b: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("assistant_text"), JsonPrimitive("reasoning_text"), JsonPrimitive("plan_text"), JsonPrimitive("command_output"), JsonPrimitive("file_change_output")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5e66c2e9667a210: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("bearer-access-token")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b5ff559bbe30e3ad: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("agentKind" to schema_36fea325bf1aca70, "cwd" to schema_36fea325bf1aca70, "query" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b61004d40d3caef8: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^([01]\\d|2[0-3]):[0-5]\\d\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6411354a37352f2: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_38754692c8b5ebef, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6587f8e609b1452: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("driver", "id"), properties = mapOf("accentColor" to schema_bf0b727f7b1c6d07, "authAcknowledged" to schema_d7851314b0afd031, "config" to schema_ca3d163bab055381, "displayName" to schema_f355c9e66a3091a2, "driver" to schema_682526ffe765f76a, "enabled" to schema_feeb8bb50144d96d, "environment" to schema_3deec5ec51dee40a, "icon" to schema_bf0b727f7b1c6d07, "id" to schema_fa4a387c10f5125f, "version" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b664e76046bb1915: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("format", "text", "version"), properties = mapOf("format" to schema_f1ccd99fb2bc2c2f, "text" to schema_ee49ed668eec9d78, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6a98d4e6efc4f4c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("model"), JsonPrimitive("config")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6aaa17d322b8355: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("autoRefresh" to schema_a6ba34cd39bf30c5, "collapsedProviders" to schema_aac2a4e83d2823be, "disabledProviders" to schema_aac2a4e83d2823be, "providerOrder" to schema_aac2a4e83d2823be, "providerRefreshIntervals" to schema_ea08f63f22aa2011, "refreshIntervalMinutes" to schema_ea193ab85993872c, "selectedRingGroups" to schema_c3ac2139868061bb, "showEstimatedCost" to schema_f8b6dd8128e8bfe0, "showInSidebar" to schema_a6ba34cd39bf30c5, "sidebarHiddenProviders" to schema_aac2a4e83d2823be), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b6f2d95e2bc1e84c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt", "threadId"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_281d24bbbaa46745, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b796dbfba5908fbc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("readResource")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_b82b9e494d3a9a40: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("built-in"), JsonPrimitive("npm-global"), JsonPrimitive("pnpm-global"), JsonPrimitive("bun-global"), JsonPrimitive("brew"), JsonPrimitive("winget"), JsonPrimitive("installer"), JsonPrimitive("unsupported")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b83973a63f086da7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("git", "matched", "name", "projectId"), properties = mapOf("git" to schema_feeb8bb50144d96d, "matched" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b84e449d1a150abf: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_36fea325bf1aca70, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b89c357946c21293: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 120, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_b8f3bd9de101caa0: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 500, items = schema_b03a8b1facfb96ed, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b92447920382853b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("providerId", "providerLabel", "servers", "sourcePath"), properties = mapOf("providerId" to schema_36fea325bf1aca70, "providerLabel" to schema_36fea325bf1aca70, "servers" to schema_409712bfaed84392, "sourcePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b966eed60d2ff4bb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("error"), JsonPrimitive("warning")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_b9817a8a76656c92: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("artwork")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_ba2bde06c4c1c0ad: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_263fd4191f415e73, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ba7dfbe6c754d186: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 160, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bab85ee50a59610a: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 3, maxLength = 255, pattern = "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_badd682f3501e022: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ok"), properties = mapOf("ok" to schema_d2dd3595e1b5e5dc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bae928818983a70a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("code")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_baf4f355dd2fd6ae: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type", "usage"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "type" to schema_a799b0e11ed8f6df, "usage" to schema_4fb4f0ac85464c4a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bb2e0e6d90c93ccf: RemoteSchema by lazy {
    RemoteSchema(type = "string", pattern = "^(?:[0-9a-f]{40}|[0-9a-f]{64})\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_bb92475a93f16082: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("inspect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bbc648a6c540c254: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 32, items = schema_9b9783ff6af74430, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_bc854d61f3c8dc6e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("instanceId", "kind"), properties = mapOf("config" to schema_ca3d163bab055381, "displayName" to schema_f355c9e66a3091a2, "enabled" to schema_feeb8bb50144d96d, "instanceId" to schema_fa4a387c10f5125f, "kind" to schema_cbc64d14585e9a92), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_bd72dfdbe3300bed: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_2168d80c99c94337, schema_2504426b5098e866), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd85a52dd25effae: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4096, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd96f28e94e5dff9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("redirect")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bd9ee7d62499d1b2: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("launchApp")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdadccb73a92373f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("branch" to schema_bf0b727f7b1c6d07, "projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3, "setUpstream" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdb4eecbb625c500: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_c073582d4fa79e4e, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bdd9db2d94de6e62: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "query"), properties = mapOf("additionalPatterns" to schema_23e05d248383ea40, "kind" to schema_ddec8c4a92583c0c, "query" to schema_dfc3f3726c991dbe, "scope" to schema_dfc3f3726c991dbe), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be1e614a6743b534: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("path", "type"), properties = mapOf("path" to schema_bf0b727f7b1c6d07, "type" to schema_3b8bae8666a9159e), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_be232916cd599465: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"), properties = mapOf("agentSettings" to schema_deb61378c1ff010b, "autoArchiveDoneAfterDays" to schema_56aa0e45cbdce0d0, "commitGenEffort" to schema_bf0b727f7b1c6d07, "commitGenFast" to schema_feeb8bb50144d96d, "commitGenModel" to schema_bf0b727f7b1c6d07, "commitGenProvider" to schema_bf0b727f7b1c6d07, "commitGenSelection" to schema_32c3720f649f40a1, "conflictResolverEffort" to schema_bf0b727f7b1c6d07, "conflictResolverFast" to schema_feeb8bb50144d96d, "conflictResolverModel" to schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode" to schema_6508684ba659826b, "conflictResolverProvider" to schema_bf0b727f7b1c6d07, "conflictResolverSelection" to schema_32c3720f649f40a1, "crews" to schema_91181085efd88304, "crossagentHiddenModels" to schema_86d5d72e84423420, "crossagentPausedProviders" to schema_0f732b9fceb2c6ac, "disabledAgents" to schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers" to schema_65899fb957cb9421, "enabledMcpServers" to schema_2d677fb04187d46b, "experimentJudgeSelection" to schema_32c3720f649f40a1, "followUpBehavior" to schema_6fcb1a55c059e655, "hiddenModels" to schema_86d5d72e84423420, "installedPlugins" to schema_e356e4b5f6808673, "memory" to schema_df5d50a7515a4b30, "newsLineActivity" to schema_feeb8bb50144d96d, "newsLineEnabled" to schema_feeb8bb50144d96d, "prAutomationDefault" to schema_6df05d56a8273d4c, "prCreateMode" to schema_bed2580f4ead331e, "prMergeMethod" to schema_9c01de6b080eca40, "providerOrder" to schema_0f732b9fceb2c6ac, "searchExclude" to schema_cda18ebe4af54c5c, "searchUseIgnoreFiles" to schema_feeb8bb50144d96d, "titleGenEffort" to schema_bf0b727f7b1c6d07, "titleGenFast" to schema_feeb8bb50144d96d, "titleGenModel" to schema_bf0b727f7b1c6d07, "titleGenProvider" to schema_bf0b727f7b1c6d07, "titleGenSelection" to schema_32c3720f649f40a1, "usage" to schema_18dc352c9a615faa, "worktreeBasePath" to schema_bf0b727f7b1c6d07, "worktreeStorageMode" to schema_953c573b196de65a, "wslCommitGenEffort" to schema_bf0b727f7b1c6d07, "wslCommitGenFast" to schema_feeb8bb50144d96d, "wslCommitGenModel" to schema_bf0b727f7b1c6d07, "wslCommitGenProvider" to schema_bf0b727f7b1c6d07, "wslCommitGenSelection" to schema_32c3720f649f40a1, "wslConflictResolverEffort" to schema_bf0b727f7b1c6d07, "wslConflictResolverFast" to schema_feeb8bb50144d96d, "wslConflictResolverModel" to schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode" to schema_6508684ba659826b, "wslConflictResolverProvider" to schema_bf0b727f7b1c6d07, "wslConflictResolverSelection" to schema_32c3720f649f40a1, "wslCrews" to schema_1af2c4430c582e39, "wslTitleGenEffort" to schema_bf0b727f7b1c6d07, "wslTitleGenFast" to schema_feeb8bb50144d96d, "wslTitleGenModel" to schema_bf0b727f7b1c6d07, "wslTitleGenProvider" to schema_bf0b727f7b1c6d07, "wslTitleGenSelection" to schema_32c3720f649f40a1, "wslWorktreeBasePath" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be268483fb86810f: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 500.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be5d5f9829abefd6: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 128, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("schedule.time-zone", "string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_be6dbda06af6b811: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKinds"), properties = mapOf("agentKinds" to schema_0c6254245418ba4c, "envs" to schema_f4e52376e9e6b7f8), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_be70182f42f8818b: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cursorSync", "id", "type"), properties = mapOf("cursorSync" to schema_b09ca5e5477734a7, "id" to schema_36fea325bf1aca70, "type" to schema_114549e732be9b99), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bea1bdef18933d97: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_d92866345cd97821, schema_8ace86d01d0cc126, schema_2a43ea36a62fa6ac), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bed2580f4ead331e: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("dialog"), JsonPrimitive("auto")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bed38fc7e15d070f: RemoteSchema by lazy {
    RemoteSchema(type = "number", literals = listOf(JsonPrimitive(4194304.0)), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf04d82b24729e4a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_53dc1dce3c536b94), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf0b727f7b1c6d07: RemoteSchema by lazy {
    RemoteSchema(type = "string", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf331e27ae5644dc: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "type"), properties = mapOf("kind" to schema_bf0b727f7b1c6d07, "type" to schema_91b38b813d4e4091), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_bf3a4ed0e5798352: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_7a4831c3c01cfb91, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf4561eb7adf4d72: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 2.0, maximum = 9007199254740991.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf61c597568a8798: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "id", "isOutdated", "isResolved"), properties = mapOf("comments" to schema_ac3d09b5c7f361d2, "id" to schema_bf0b727f7b1c6d07, "isOutdated" to schema_feeb8bb50144d96d, "isResolved" to schema_feeb8bb50144d96d, "line" to schema_3d06117798bf5171, "path" to schema_bf0b727f7b1c6d07, "side" to schema_7d62681c6488867d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf64eabed7a187d3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCache", "snapshots"), properties = mapOf("fromCache" to schema_feeb8bb50144d96d, "ringLayouts" to schema_80c5703401a577fc, "snapshots" to schema_798eeb053ed633fd), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf88f4ab17c45df7: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "language", "text"), properties = mapOf("kind" to schema_bae928818983a70a, "language" to schema_a4534512a153f9e4, "text" to schema_7673f46694e3b986), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bf9d1b72f36fb4df: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("diagnostics", "manifest", "mcpServers", "name", "poracode", "root", "skills", "source"), properties = mapOf("diagnostics" to schema_69ff9fac2802eff8, "manifest" to schema_1342a7c5641b1f5e, "mcpServers" to schema_536ec91da82d55b6, "name" to schema_36fea325bf1aca70, "poracode" to schema_4cba70490147a86e, "root" to schema_36fea325bf1aca70, "skills" to schema_ed137d754271e7b1, "source" to schema_3a8039d5ad693c16), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_bfc0c020a52f85b3: RemoteSchema by lazy {
    RemoteSchema(type = "string", defaultValue = JsonPrimitive("origin"), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_bfc61ac710ca35a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("action", "catalogId"), properties = mapOf("action" to schema_a29fb465775d8abb, "catalogId" to schema_d855999aed5e6438), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_bfe4502f319fd2d1: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("source" to schema_b5a9f6bbb8f67f9f, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c028422c57a7c557: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("none")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c035bb3d9960d3a8: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("defaults"), properties = mapOf("defaults" to schema_e51d77fd6734b53a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c04b1452d18edb3f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "name", "transport"), properties = mapOf("description" to schema_38d1a07d3b9b1c82, "disabledTools" to schema_515482d2104d1efa, "enabled" to schema_a6ba34cd39bf30c5, "id" to schema_36fea325bf1aca70, "name" to schema_24a221c9609f967e, "timeoutMs" to schema_1da6db5f13bd36e1, "transport" to schema_0e40f389d72655d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("mcp.reserved-name"))
}

internal val schema_c052748939bdd575: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, maxItems = 8, items = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
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

internal val schema_c0edab91e2f5d96e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_cd6770504afebb5a, "problem" to schema_6ef72b13e31a5a70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1094a243b47f83c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("cells", "max", "metric", "windowDays"), properties = mapOf("cells" to schema_08654ec33ed5db02, "max" to schema_56aa0e45cbdce0d0, "metric" to schema_b7f9b9a51ee842c4, "windowDays" to schema_56aa0e45cbdce0d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c133c6f7b7129d49: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("candidateDisposition", "kind", "revision"), properties = mapOf("candidateDisposition" to schema_60232db9c637a046, "kind" to schema_034741cb26a53fe4, "revision" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1417bffe520aa1c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("mcpServers" to schema_86b938ce61c1942e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1504401bd291fd1: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 4096, pattern = "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1862c8cf975e3dc: RemoteSchema by lazy {
    RemoteSchema(type = "string", maxLength = 3145728, pattern = "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+\$", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c18ccc2aa36fdad0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("policy", "roles", "version"), properties = mapOf("crewId" to schema_7d62681c6488867d, "name" to schema_eef7e0a1ed6691c0, "policy" to schema_5e585becfdaebc00, "roles" to schema_5994d84d0d782ee0, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_c1a108aae42275ff: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("distro", "sourceScope"), properties = mapOf("distro" to schema_36fea325bf1aca70, "sourceScope" to schema_86230e1fa3f38188), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_c1d4a9f752e166b1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("ahead", "behind", "branch", "hasRemote", "isRepo", "remoteInfo", "staged", "totalDeletions", "totalInsertions", "tracking", "unstaged"), properties = mapOf("ahead" to schema_3d06117798bf5171, "behind" to schema_3d06117798bf5171, "branch" to schema_bf0b727f7b1c6d07, "conflictFiles" to schema_1399799a226dcc71, "detail" to schema_15cae388d0cdd5b6, "hasRemote" to schema_feeb8bb50144d96d, "headSha" to schema_bf0b727f7b1c6d07, "isRepo" to schema_feeb8bb50144d96d, "mergeInProgress" to schema_feeb8bb50144d96d, "mergeMessage" to schema_bf0b727f7b1c6d07, "remoteInfo" to schema_9d9cbc9ed0e89822, "staged" to schema_1399799a226dcc71, "totalDeletions" to schema_3d06117798bf5171, "totalInsertions" to schema_3d06117798bf5171, "tracking" to schema_bf0b727f7b1c6d07, "unstaged" to schema_1399799a226dcc71), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1f357f1f88472e8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("starting"), JsonPrimitive("active"), JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c1f4a31c98798d12: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projects"), properties = mapOf("created" to schema_feeb8bb50144d96d, "project" to schema_9ee4a9aa10a4d238, "projects" to schema_61efa8909f32b55e), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_c215a52302a1f428: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "ok"), properties = mapOf("kind" to schema_69711423c3b7d2a6, "ok" to schema_d2dd3595e1b5e5dc), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
