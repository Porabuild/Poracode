package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichOpenRequest
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRequestOption
import com.poracode.app.chat.RichRequestType
import com.poracode.app.chat.toJsonArrayOrNull
import com.poracode.app.model.ThreadConfig
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.queueFollowUp
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
    queueInsteadOfSteer: Boolean = false,
): RichChatOperationResult<Unit>? {
    val prompt = RichChatUiLogic.composerPrompt(
        draft,
        queuedSegments,
        hasAttachments = attachments.isNotEmpty(),
    ) ?: return null
    val segments = RichChatUiLogic.composerSegments(queuedSegments, attachments, draft)
    activeRequest?.let { request ->
        val denial = RichChatUiLogic.composerDenyResolution(request) ?: return@let
        when (val result = runtime.chat.resolveRequest(denial)) {
            is RichChatOperationResult.Success -> Unit
            else -> return result
        }
    }
    return when (followUpSubmitAction(isTurnActive, queueInsteadOfSteer)) {
        RichFollowUpSubmitAction.STEER ->
            runtime.chat.setSteer(
                ThreadSteerInput(
                    prompt = prompt,
                    config = configuration.toJsonObject(),
                    segments = segments,
                ),
            )
        RichFollowUpSubmitAction.QUEUE ->
            runtime.chat.queueFollowUp(
                prompt = prompt,
                config = configuration.toJsonObject(),
                segments = segments,
            )
        RichFollowUpSubmitAction.SEND ->
            runtime.chat.send(
                prompt = prompt,
                config = configuration,
                segments = segments,
            )
    }
}

/**
 * Picks a cut-off turn back up through the same send path as a typed message:
 * the unanswered plain-text message again, or [continuePrompt]. When the host
 * refuses that send because it lost the thread's session, [relaunch] starts
 * the thread with the same prompt instead.
 */
internal suspend fun submitRichChatResume(
    runtime: RichChatSessionRuntime,
    plan: RichChatResumePlan,
    continuePrompt: String,
    configuration: ThreadConfig,
    activeRequest: RichOpenRequest?,
    relaunch: RichChatResumeRelaunch? = null,
): RichChatOperationResult<Unit>? {
    val draft = when (plan) {
        is RichChatResumePlan.Resend -> plan.prompt
        RichChatResumePlan.Continue -> continuePrompt
    }
    val sent = submitRichChatComposer(
        runtime = runtime,
        draft = draft,
        configuration = configuration,
        queuedSegments = emptyList(),
        attachments = emptyList(),
        isTurnActive = false,
        activeRequest = activeRequest,
    )
    val refusal = (sent as? RichChatOperationResult.Failed)?.failure ?: return sent
    return relaunch?.afterRefusal(runtime, refusal, draft.trim(), configuration) ?: sent
}

internal enum class RichFollowUpSubmitAction { SEND, STEER, QUEUE }

/** Desktop parity: sending while a turn is active steers by default; the
 * composer's opposite-mode affordance (long-press on mobile) queues instead. */
internal fun followUpSubmitAction(
    isTurnActive: Boolean,
    queueInsteadOfSteer: Boolean,
): RichFollowUpSubmitAction = when {
    !isTurnActive -> RichFollowUpSubmitAction.SEND
    queueInsteadOfSteer -> RichFollowUpSubmitAction.QUEUE
    else -> RichFollowUpSubmitAction.STEER
}

internal fun RichChatUiLogic.composerPrompt(
    draft: String,
    segments: List<RichPromptSegment>,
    hasAttachments: Boolean = false,
): String? {
    val typed = draft.trim()
    if (typed.isNotEmpty()) return typed
    val structured = segments.mapNotNull { segment ->
        when (segment) {
            is RichPromptSegment.File -> "@${segment.path}"
            is RichPromptSegment.Skill -> segment.invocation
            is RichPromptSegment.Mcp -> "@${segment.name.ifBlank { segment.id }}"
            is RichPromptSegment.Thread -> "@${segment.title.ifBlank { segment.threadId }}"
            is RichPromptSegment.DiffComment -> segment.body
            is RichPromptSegment.Text -> segment.content
            is RichPromptSegment.Attachment -> null
        }
    }.joinToString(" ").trim()
    if (structured.isNotEmpty()) return structured
    // An attachment on its own is a complete message (the host's sendable-input
    // rule): it submits with an empty prompt and attachment segments.
    return if (hasAttachments) "" else null
}

internal fun RichChatUiLogic.composerSegments(
    segments: List<RichPromptSegment>,
    attachments: List<UploadedAttachment>,
    draft: String,
) = (segments.flatMap { listOf(it, RichPromptSegment.Text(" ")) } +
    listOfNotNull(draft.takeIf(String::isNotBlank)?.let(RichPromptSegment::Text)) + attachments.map {
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
