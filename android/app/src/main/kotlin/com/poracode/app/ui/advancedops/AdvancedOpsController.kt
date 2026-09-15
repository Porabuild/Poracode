package com.poracode.app.ui.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOwnerKind
import com.poracode.app.session.advancedops.AdvancedControllerResult
import com.poracode.app.session.advancedops.AdvancedMutationOutcome
import com.poracode.app.session.advancedops.AdvancedOperationFailure
import com.poracode.app.session.advancedops.AdvancedOpsFoundation
import com.poracode.app.session.advancedops.AdvancedOwnerSnapshot
import com.poracode.app.session.advancedops.ConfirmedMutationResult
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI boundary for all advanced operations. It publishes only typed values and safe failures. */
class AdvancedOpsController(
    private val owners: StateFlow<AdvancedOwnerSnapshot>,
    private val scope: CoroutineScope,
) {
    private data class Captured(
        val foundation: AdvancedOpsFoundation,
        val id: Long,
        val ui: AdvancedConfirmationUi,
    )

    private val mutable = MutableStateFlow(AdvancedOpsUiState())
    val state: StateFlow<AdvancedOpsUiState> = mutable.asStateFlow()
    private val installed = AtomicReference<AdvancedOpsFoundation?>(null)
    private var active: Job? = null
    private var captured: Captured? = null

    fun installFoundation(foundation: AdvancedOpsFoundation?) {
        if (installed.getAndSet(foundation) === foundation) return
        cancelTransientWork()
    }

    fun submit(input: AdvancedInput) {
        if (mutable.value.busy) return
        val snapshot = owners.value
        val foundation = installed.get()
        val gate = gate(input.action, snapshot)
        if (gate != null || foundation == null) {
            mutable.value = mutable.value.copy(
                failure = gate ?: AdvancedSafeFailure.Unavailable,
                output = null,
            )
            return
        }
        when (input) {
            is AdvancedInput.WriteExternal -> captureOverwrite(foundation, input)
            is AdvancedInput.MoveEntry -> captureMove(foundation, input)
            is AdvancedInput.DeleteEntry -> captureDelete(foundation, input)
            else -> launchOperation { execute(foundation, input, snapshot) }
        }
    }

    fun confirm() {
        val pending = captured ?: return
        if (installed.get() !== pending.foundation) {
            dismissConfirmation()
            mutable.value = mutable.value.copy(failure = AdvancedSafeFailure.Stale)
            return
        }
        captured = null
        mutable.value = mutable.value.copy(confirmation = null)
        launchOperation {
            when (val result = pending.foundation.externalProjectFiles.confirm(pending.id)) {
                is ConfirmedMutationResult.Completed -> AdvancedOutput.Mutation(result.outcome)
                is ConfirmedMutationResult.Failed -> throw SafeFailure(result.failure)
                ConfirmedMutationResult.Stale -> throw SafeFailure(AdvancedSafeFailure.Stale)
                is ConfirmedMutationResult.ConfirmationRequired -> error("Unexpected confirmation")
            }
        }
    }

    fun dismissConfirmation() {
        val pending = captured
        captured = null
        pending?.foundation?.externalProjectFiles?.dismiss(pending.id)
        mutable.value = mutable.value.copy(confirmation = null)
    }

    fun clearResult() {
        mutable.value = mutable.value.copy(output = null, failure = null)
    }

    fun cancelTransientWork() {
        active?.cancel(CancellationException("Advanced operation lifecycle ended"))
        active = null
        dismissConfirmation()
        mutable.value = AdvancedOpsUiState()
    }

    fun gate(action: AdvancedAction): AdvancedSafeFailure? = gate(action, owners.value)

    private fun gate(
        action: AdvancedAction,
        snapshot: AdvancedOwnerSnapshot,
    ): AdvancedSafeFailure? {
        if (!snapshot.foreground) return AdvancedSafeFailure.Background
        val host = snapshot.host ?: return AdvancedSafeFailure.NoOwner
        if (!host.online) return AdvancedSafeFailure.Offline
        if (!host.ready) return AdvancedSafeFailure.NotReady
        if (action.operation.scope !in host.scopes) return AdvancedSafeFailure.MissingScope
        val hasOwner = when (action.operation.owner) {
            AdvancedOwnerKind.Thread -> snapshot.thread != null
            AdvancedOwnerKind.ProjectLocation -> snapshot.project != null
            AdvancedOwnerKind.Location -> snapshot.location != null
        }
        return if (hasOwner) null else AdvancedSafeFailure.NoOwner
    }

    private fun captureOverwrite(
        foundation: AdvancedOpsFoundation,
        input: AdvancedInput.WriteExternal,
    ) {
        val owner = owners.value.project ?: return fail(AdvancedSafeFailure.NoOwner)
        val confirmation = foundation.externalProjectFiles.requestOverwrite(
            owner,
            input.absolutePath,
            input.content,
            input.baseModifiedAtMs,
        ).confirmation
        installCapture(foundation, confirmation.id, input.action, confirmation.path)
    }

    private fun captureMove(foundation: AdvancedOpsFoundation, input: AdvancedInput.MoveEntry) {
        val owner = owners.value.project ?: return fail(AdvancedSafeFailure.NoOwner)
        val confirmation = foundation.externalProjectFiles.requestMove(
            owner,
            input.path,
            input.nextParentPath,
        ).confirmation
        installCapture(foundation, confirmation.id, input.action, confirmation.path)
    }

    private fun captureDelete(foundation: AdvancedOpsFoundation, input: AdvancedInput.DeleteEntry) {
        val owner = owners.value.project ?: return fail(AdvancedSafeFailure.NoOwner)
        val confirmation = foundation.externalProjectFiles.requestDelete(owner, input.path).confirmation
        installCapture(foundation, confirmation.id, input.action, confirmation.path)
    }

    private fun installCapture(
        foundation: AdvancedOpsFoundation,
        id: Long,
        action: AdvancedAction,
        path: String,
    ) {
        dismissConfirmation()
        val ui = AdvancedConfirmationUi(action, path)
        captured = Captured(foundation, id, ui)
        mutable.value = AdvancedOpsUiState(confirmation = ui)
    }

    private fun launchOperation(operation: suspend () -> AdvancedOutput) {
        mutable.value = AdvancedOpsUiState(busy = true)
        active = scope.launch {
            try {
                val output = operation()
                mutable.value = AdvancedOpsUiState(output = output)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: SafeFailure) {
                mutable.value = AdvancedOpsUiState(failure = failure.failure)
            } catch (_: Exception) {
                mutable.value = AdvancedOpsUiState(failure = AdvancedSafeFailure.Remote)
            } finally {
                active = null
                if (mutable.value.busy) mutable.value = mutable.value.copy(busy = false)
            }
        }
    }

    private suspend fun execute(
        foundation: AdvancedOpsFoundation,
        input: AdvancedInput,
        snapshot: AdvancedOwnerSnapshot,
    ): AdvancedOutput {
        return when (input) {
            is AdvancedInput.CreateCheckpoint -> foundation.checkpointSubagentInput
                .createCheckpoint(requireNotNull(snapshot.thread), input.checkpointItemId)
                .value { AdvancedOutput.Checkpoint(it) }
            is AdvancedInput.FinalizeCheckpoint -> foundation.checkpointSubagentInput
                .finalizeCheckpoint(
                    requireNotNull(snapshot.thread),
                    input.checkpointItemId,
                    input.baseCheckpointItemId,
                ).value { AdvancedOutput.Checkpoint(it) }
            is AdvancedInput.Subscribe -> foundation.checkpointSubagentInput
                .subscribe(requireNotNull(snapshot.thread), input.parentItemId)
                .value { AdvancedOutput.Events(it.events) }
            is AdvancedInput.Unsubscribe -> foundation.checkpointSubagentInput
                .unsubscribe(requireNotNull(snapshot.thread), input.parentItemId)
                .value { AdvancedOutput.Mutation(it) }
            is AdvancedInput.StageInput -> foundation.checkpointSubagentInput
                .stageInput(requireNotNull(snapshot.thread), input.prompt, input.segments)
                .value { AdvancedOutput.Mutation(it) }
            is AdvancedInput.WorkflowRun -> foundation.workflow.getRun(
                requireNotNull(snapshot.location),
                input.manifestPath,
                input.transcriptDirectory,
                input.includeAgentChats,
            ).value { AdvancedOutput.WorkflowRun(it) }
            is AdvancedInput.WorkflowChat -> foundation.workflow.agentChat(
                requireNotNull(snapshot.location),
                input.threadId,
                input.transcriptDirectory,
                input.agentId,
                input.agentFinished,
            ).value { AdvancedOutput.WorkflowChat(it) }
            is AdvancedInput.ReadAbsolute -> foundation.externalProjectFiles
                .readAbsolute(requireNotNull(snapshot.project), input.absolutePath)
                .value { AdvancedOutput.AbsoluteFile(it) }
            is AdvancedInput.ReadExternal -> foundation.externalProjectFiles
                .readExternal(requireNotNull(snapshot.project), input.absolutePath)
                .value { AdvancedOutput.ExternalFile(it) }
            is AdvancedInput.CreateEntry -> foundation.externalProjectFiles
                .create(requireNotNull(snapshot.project), input.path, input.type)
                .value { AdvancedOutput.Mutation(it) }
            is AdvancedInput.RenameEntry -> foundation.externalProjectFiles
                .rename(requireNotNull(snapshot.project), input.path, input.nextName)
                .value { AdvancedOutput.Mutation(it) }
            is AdvancedInput.GenerateCommit -> foundation.generationHelpers
                .commitMessage(requireNotNull(snapshot.project), input.options)
                .value { AdvancedOutput.GeneratedText(null, it.message) }
            is AdvancedInput.GenerateTitle -> foundation.generationHelpers
                .title(requireNotNull(snapshot.project), input.prompt, input.options)
                .value { AdvancedOutput.GeneratedText(it.title, it.title) }
            is AdvancedInput.GeneratePr -> foundation.generationHelpers
                .prSummary(
                    requireNotNull(snapshot.project),
                    input.branch,
                    input.baseBranch,
                    input.options,
                ).value { AdvancedOutput.GeneratedText(it.title, it.description) }
            is AdvancedInput.WriteExternal,
            is AdvancedInput.MoveEntry,
            is AdvancedInput.DeleteEntry,
            -> error("Destructive input must be confirmed")
        }
    }

    private fun fail(failure: AdvancedSafeFailure) {
        mutable.value = AdvancedOpsUiState(failure = failure)
    }
}

private class SafeFailure(val failure: AdvancedSafeFailure) : Exception()

private fun SafeFailure(failure: AdvancedOperationFailure) = SafeFailure(
    when (failure) {
        AdvancedOperationFailure.Closed -> AdvancedSafeFailure.Unavailable
        AdvancedOperationFailure.StaleOwner -> AdvancedSafeFailure.Stale
        AdvancedOperationFailure.Offline -> AdvancedSafeFailure.Offline
        AdvancedOperationFailure.SessionNotReady -> AdvancedSafeFailure.NotReady
        AdvancedOperationFailure.AuthenticationRequired -> AdvancedSafeFailure.Authentication
        is AdvancedOperationFailure.AuthorizationDenied -> AdvancedSafeFailure.MissingScope
        is AdvancedOperationFailure.Remote -> AdvancedSafeFailure.Remote
    },
)

private fun <T> AdvancedControllerResult<T>.value(transform: (T) -> AdvancedOutput): AdvancedOutput =
    when (this) {
        is AdvancedControllerResult.Success -> transform(value)
        is AdvancedControllerResult.Failed -> throw SafeFailure(failure)
        AdvancedControllerResult.Stale -> throw SafeFailure(AdvancedSafeFailure.Stale)
    }
