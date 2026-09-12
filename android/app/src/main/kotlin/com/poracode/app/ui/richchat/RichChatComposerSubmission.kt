package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichOpenRequest
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRequestOption
import com.poracode.app.chat.RichRequestType
import com.poracode.app.chat.toJsonArrayOrNull
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.transport.richchat.RequestResolution
import com.poracode.app.transport.richchat.ThreadSteerInput
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal suspend fun submitRichChatComposer(
    runtime: RichChatSessionRuntime,
    draft: String,
    configuration: ThreadConfig,
    queuedSegments: List<RichPromptSegment>,
    attachments: List<UploadedAttachment>,
    isTurnActive: Boolean,
    activeRequest: RichOpenRequest?,
): RichChatOperationResult<Unit>? {
    val prompt = RichChatUiLogic.composerPrompt(draft, queuedSegments)
        ?: return null
    val segments = RichChatUiLogic.composerSegments(queuedSegments, attachments)
    activeRequest?.let { request ->
        val denial = RichChatUiLogic.composerDenyResolution(request) ?: return@let
        when (val result = runtime.chat.resolveRequest(denial)) {
            is RichChatOperationResult.Success -> Unit
            else -> return result
        }
    }
    return if (isTurnActive) {
        runtime.chat.setSteer(
            ThreadSteerInput(
                prompt = prompt,
                config = configuration.toJsonObject(),
                segments = segments,
            ),
        )
    } else {
        runtime.chat.send(
            prompt = prompt,
            config = configuration,
            segments = segments,
        )
    }
}

internal fun RichChatUiLogic.composerPrompt(
    draft: String,
    segments: List<RichPromptSegment>,
): String? {
    val typed = draft.trim()
    if (typed.isNotEmpty()) return typed
    return segments.mapNotNull { segment ->
        when (segment) {
            is RichPromptSegment.File -> "@${segment.path}"
            is RichPromptSegment.Skill -> segment.invocation
            is RichPromptSegment.Mcp -> "@${segment.name.ifBlank { segment.id }}"
            is RichPromptSegment.Thread -> "@${segment.title.ifBlank { segment.threadId }}"
            is RichPromptSegment.DiffComment -> segment.body
            is RichPromptSegment.Text -> segment.content
            is RichPromptSegment.Attachment -> null
        }
    }.joinToString(" ").trim().takeIf(String::isNotEmpty)
}

internal fun RichChatUiLogic.composerSegments(
    segments: List<RichPromptSegment>,
    attachments: List<UploadedAttachment>,
) = (segments + attachments.map {
    RichPromptSegment.Attachment(it.remotePath, it.mimeType)
}).toJsonArrayOrNull()

/** Prose in the composer declines a regular approval before starting the next turn. */
internal fun RichChatUiLogic.composerDenyResolution(
    request: RichOpenRequest,
): RequestResolution? {
    if (request.type !in setOf(
            RichRequestType.COMMAND_EXECUTION_APPROVAL,
            RichRequestType.FILE_READ_APPROVAL,
            RichRequestType.FILE_CHANGE_APPROVAL,
            RichRequestType.APPLY_PATCH_APPROVAL,
            RichRequestType.TOOL_CALL_APPROVAL,
        )
    ) return null
    val toolName = (request.payload.details as? JsonObject)
        ?.get("toolName")
        ?.let { it as? JsonPrimitive }
        ?.takeIf(JsonPrimitive::isString)
        ?.content
    if (toolName.equals("ExitPlanMode", ignoreCase = true)) return null
    val options = request.payload.options ?: listOf(
        RichRequestOption("allow", "Allow"),
        RichRequestOption("deny", "Deny"),
    )
    val deny = options.firstOrNull { option ->
        val value = "${option.optionId} ${option.label}".lowercase()
        listOf("deny", "denied", "decline", "reject", "abort", "cancel").any(value::contains)
    } ?: return null
    return RichChatUiLogic.requestResolution(request.id.jsonValue, deny.optionId)
}
