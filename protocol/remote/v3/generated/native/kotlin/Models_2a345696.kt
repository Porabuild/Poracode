// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
@Serializable
data class ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1(
    @SerialName("tabId") val tabId: Long,
    @SerialName("title") val title: RemoteField<String> = RemoteField.Missing,
    @SerialName("url") val url: RemoteField<String> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("tabId", "Long", true, false, 0.0, 9007199254740991.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("title", "String", false, false, null, null, null, 300, null, null, null, null, listOf()),
            RemoteFieldDescriptor("url", "String", false, false, null, null, null, 2048, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1(
    @SerialName("activeTab") val activeTab: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("activeTab", "ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498(
    @SerialName("text") val text: String,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("text", "String", true, false, null, null, null, 50000, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
data class ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f(
    @SerialName("browserFocus") val browserFocus: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1> = RemoteField.Missing,
    @SerialName("conversationSnapshot") val conversationSnapshot: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498> = RemoteField.Missing,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("browserFocus", "ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1", false, false, null, null, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("conversationSnapshot", "ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498", false, false, null, null, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5 {
    @SerialName("browser") BROWSER,
    @SerialName("crossagents") CROSSAGENTS,
    @SerialName("chrome") CHROME,
    @SerialName("computer-use") COMPUTERU2DUSE,
    @SerialName("app-controls") APPU2DCONTROLS,
}

typealias ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b = Map<String, List<String>>

@Serializable
data class ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09(
    @SerialName("cols") val cols: Long,
    @SerialName("rows") val rows: Long,
) {
    companion object {
        val descriptor = RemoteModelDescriptor(RemoteUnknownFieldPolicy.STRIP, listOf(
            RemoteFieldDescriptor("cols", "Long", true, false, 20.0, 400.0, null, null, null, null, null, null, listOf()),
            RemoteFieldDescriptor("rows", "Long", true, false, 5.0, 200.0, null, null, null, null, null, null, listOf()),
        ), listOf())
    }
}

@Serializable
enum class ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498 {
    @SerialName("thread-transcript") THREADU2DTRANSCRIPT,
    @SerialName("context-file") CONTEXTU2DFILE,
}
