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

internal val schema_28f26b87e53ebaef: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("learn"), JsonPrimitive("recall"), JsonPrimitive("incognito")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_290453f28a433311: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId", "url"), properties = mapOf("kind" to schema_9063020a6c5ad8b3, "tabId" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_291e0a286efaf880: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("channel", "previewId", "version"), properties = mapOf("channel" to schema_3c702b70b3eb4220, "previewId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
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

internal val schema_29860e4152b5fa24: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"), properties = mapOf("appVersion" to schema_36fea325bf1aca70, "auth" to schema_2a8bc62fab6ac143, "capabilities" to schema_54d35c19b9d9534c, "desktopId" to schema_36fea325bf1aca70, "endpoints" to schema_17c2b8a25332cd3a, "hostMode" to schema_d1d1696e7dc33885, "label" to schema_36fea325bf1aca70, "platform" to schema_7583b8d37fafbf18, "protocolVersion" to schema_8d7cbafc0ecc27cb, "toolPresentation" to schema_b5b89821dbf7fe4a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
