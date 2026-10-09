// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_fae23683c505297d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_59cd628901920f3f, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fb2c7b23aa8ee7aa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "config" to schema_c721e8abc0a20d4a, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("thread.start.provider-switch"))
}

internal val schema_fb3dd6021c9a98a4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("default", "description", "env", "key", "label", "type"), properties = mapOf("default" to schema_feeb8bb50144d96d, "description" to schema_bf0b727f7b1c6d07, "env" to schema_e51d77fd6734b53a, "key" to schema_36fea325bf1aca70, "label" to schema_36fea325bf1aca70, "platforms" to schema_0f732b9fceb2c6ac, "type" to schema_e841af2cbd75708d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fbbd215f628f20ac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "enabled", "name", "prompt", "recurrence"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "config" to schema_f69100925fc0e774, "enabled" to schema_feeb8bb50144d96d, "name" to schema_b89c357946c21293, "projectId" to schema_2d0b6ec9f2b2decf, "prompt" to schema_30cc89214bd9dffb, "recurrence" to schema_370441a9f9465376), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc49e8b0b6ac2911: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "threadId", "worktreeBranch", "worktreeOwnerToken", "worktreeState"), properties = mapOf("agentKind" to schema_36fea325bf1aca70, "agentLabel" to schema_36fea325bf1aca70, "effort" to schema_36fea325bf1aca70, "fast" to schema_feeb8bb50144d96d, "model" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70, "worktreeBranch" to schema_36fea325bf1aca70, "worktreeOwnerToken" to schema_8e43cad70cd70de7, "worktreePath" to schema_36fea325bf1aca70, "worktreeState" to schema_a8b4490d4a4f6745), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc779c522d442c13: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("target")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fc9d6f4c2617a24d: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_5d401c152e12e715, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fcb2eed91b3e89ce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("request.opened")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fcc27361f311c65f: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_8f2b1c9a1a17a06a, schema_d1525f33bd07c0cc), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fcdee201e3f789e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_fe5593c9ecc8feb2, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd056ca894e30f21: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_bf0b727f7b1c6d07, propertyNames = schema_36fea325bf1aca70, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd6258ac6546d705: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd8574a70c8187db: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("endpoint", "expirationTime", "keys"), properties = mapOf("endpoint" to schema_51e99f5d3372fb77, "expirationTime" to schema_60e901bdbc3f78cd, "keys" to schema_29fba8fe9f5724e0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fd95a83e5b156564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("summary"), properties = mapOf("details" to schema_ca3d163bab055381, "multiSelect" to schema_feeb8bb50144d96d, "options" to schema_302783bd5327b877, "summary" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fdad254a8bac8914: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf()), additionalSchema = schema_515482d2104d1efa, propertyNames = schema_13f43aaaf56911fa, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe5593c9ecc8feb2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"), properties = mapOf("authLogoutSupported" to schema_feeb8bb50144d96d, "authMethods" to schema_cd0a57f27ae4fccb, "authState" to schema_2363c4dd0a78ce9d, "authUsesProviderLogin" to schema_feeb8bb50144d96d, "capabilities" to schema_ca70f506a75e1e3b, "installationSource" to schema_36fea325bf1aca70, "installed" to schema_feeb8bb50144d96d, "loginCommand" to schema_36fea325bf1aca70, "loginCommandDisplay" to schema_36fea325bf1aca70, "preferTerminalLogin" to schema_feeb8bb50144d96d, "presentationMode" to schema_6508684ba659826b, "providerMetadata" to schema_197c2b8c01d7f4ed, "version" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe73ac6ba621dd72: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("version"), properties = mapOf("version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe7522595f5637c3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "itemType", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "itemType" to schema_5455d140717a50b3, "parentItemId" to schema_bf0b727f7b1c6d07, "payload" to schema_ca3d163bab055381, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_441bce375b64f3d0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe79d48b8af45e7d: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ping")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe7aea0f55ed142e: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_8b1889f3513fe2b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fe8cce293da1b3f5: RemoteSchema by lazy {
    RemoteSchema(type = "array", minItems = 1, items = schema_413ace8627552254, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_fed486f9f6e73521: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_c6b76607f48c889e, schema_ca0c8b8a7fbb7b5d, schema_f04c7b0573aff59c, schema_eb2405f61baf028b, schema_ec76fa076d16485a, schema_d1df243f455504fc), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_feeb8bb50144d96d: RemoteSchema by lazy {
    RemoteSchema(type = "boolean", unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ff495aee3e719fab: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("parentItemId", "threadId"), properties = mapOf("parentItemId" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_ffdf9008e6986c48: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_fed486f9f6e73521, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
