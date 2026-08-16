package com.poracode.app.session.advancedops

import com.poracode.app.protocol.advancedops.AbsoluteFileResult
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.AdvancedPayloads
import com.poracode.app.protocol.advancedops.AdvancedResultAdapters
import com.poracode.app.protocol.advancedops.ExternalFileResult
import com.poracode.app.protocol.advancedops.ExternalFileWriteResult
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

enum class ProjectEntryType(val wireName: String) { File("file"), Directory("directory") }
enum class DestructiveAction { Move, Delete, Overwrite }

data class DestructiveConfirmation(
    val id: Long,
    val action: DestructiveAction,
    val owner: ProjectLocationAdvancedOwner,
    val path: String,
    internal val call: AdvancedCall,
    internal val reconciliation: AdvancedCall,
)

sealed interface ConfirmedMutationResult {
    data class ConfirmationRequired(val confirmation: DestructiveConfirmation) : ConfirmedMutationResult
    data class Completed(val outcome: AdvancedMutationOutcome) : ConfirmedMutationResult
    data class Failed(val failure: AdvancedOperationFailure) : ConfirmedMutationResult
    data object Stale : ConfirmedMutationResult
}

/** File/project operations with captured, one-shot confirmation for destructive requests. */
class ExternalProjectFilesController(private val gateway: AdvancedOpsGateway) {
    private val runtime = AdvancedControllerRuntime()
    private val confirmationIds = AtomicLong()
    private val pending = ConcurrentHashMap<Long, DestructiveConfirmation>()

    suspend fun readAbsolute(
        owner: ProjectLocationAdvancedOwner,
        absolutePath: String,
    ): AdvancedControllerResult<AbsoluteFileResult> = runtime.read(
        "file:absolute:${owner.serializationKey}:$absolutePath",
    ) {
        AdvancedResultAdapters.absoluteFile(
            gateway.read(readCall(AdvancedOperation.ReadAbsoluteFile, owner, absolutePath)),
        )
    }

    suspend fun readExternal(
        owner: ProjectLocationAdvancedOwner,
        absolutePath: String,
    ): AdvancedControllerResult<ExternalFileResult> = runtime.read(
        "file:external:${owner.serializationKey}:$absolutePath",
    ) {
        AdvancedResultAdapters.externalFile(
            gateway.read(readCall(AdvancedOperation.ReadExternalFile, owner, absolutePath)),
        )
    }

    fun requestOverwrite(
        owner: ProjectLocationAdvancedOwner,
        absolutePath: String,
        content: String,
        baseModifiedAtMs: Double,
    ): ConfirmedMutationResult.ConfirmationRequired {
        val mutation = AdvancedCall(
            AdvancedOperation.WriteExternalFile,
            owner,
            AdvancedPayloads.externalWrite(
                owner.location,
                absolutePath,
                content,
                baseModifiedAtMs,
            ),
        )
        return capture(
            DestructiveAction.Overwrite,
            owner,
            absolutePath,
            mutation,
            readCall(AdvancedOperation.ReadExternalFile, owner, absolutePath),
        )
    }

    suspend fun create(owner: ProjectLocationAdvancedOwner, path: String, type: ProjectEntryType) =
        runtime.mutation("entry:create:${owner.serializationKey}") {
            val mutation = AdvancedCall(
                AdvancedOperation.CreateProjectEntry,
                owner,
                AdvancedPayloads.projectEntry(owner.location, path, type = type.wireName),
            )
            gateway.mutate(
                mutation,
                readCall(
                    AdvancedOperation.ReadAbsoluteFile,
                    owner,
                    resolveProjectPath(owner.location.path, path),
                ),
            )
        }

    suspend fun rename(owner: ProjectLocationAdvancedOwner, path: String, nextName: String) =
        runtime.mutation("entry:rename:${owner.serializationKey}") {
            val mutation = AdvancedCall(
                AdvancedOperation.RenameProjectEntry,
                owner,
                AdvancedPayloads.projectEntry(owner.location, path, nextName = nextName),
            )
            gateway.mutate(
                mutation,
                readCall(
                    AdvancedOperation.ReadAbsoluteFile,
                    owner,
                    resolveProjectPath(owner.location.path, siblingPath(path, nextName)),
                ),
            )
        }

    fun requestMove(
        owner: ProjectLocationAdvancedOwner,
        path: String,
        nextParentPath: String = "",
    ): ConfirmedMutationResult.ConfirmationRequired {
        val mutation = AdvancedCall(
            AdvancedOperation.MoveProjectEntry,
            owner,
            AdvancedPayloads.projectEntry(
                owner.location,
                path,
                nextParentPath = nextParentPath,
            ),
        )
        return capture(
            DestructiveAction.Move,
            owner,
            path,
            mutation,
            readCall(
                AdvancedOperation.ReadAbsoluteFile,
                owner,
                resolveProjectPath(owner.location.path, movedPath(path, nextParentPath)),
            ),
        )
    }

    fun requestDelete(
        owner: ProjectLocationAdvancedOwner,
        path: String,
    ): ConfirmedMutationResult.ConfirmationRequired {
        val mutation = AdvancedCall(
            AdvancedOperation.DeleteProjectEntry,
            owner,
            AdvancedPayloads.projectEntry(owner.location, path),
        )
        return capture(
            DestructiveAction.Delete,
            owner,
            path,
            mutation,
            readCall(
                AdvancedOperation.ReadAbsoluteFile,
                owner,
                resolveProjectPath(owner.location.path, path),
            ),
        )
    }

    suspend fun confirm(id: Long): ConfirmedMutationResult {
        val captured = pending.remove(id) ?: return ConfirmedMutationResult.Failed(
            AdvancedOperationFailure.Remote(400, "confirmation_missing", false),
        )
        return when (
            val result = runtime.mutation("confirmed:${captured.owner.serializationKey}") {
                gateway.mutate(captured.call, captured.reconciliation)
            }
        ) {
            is AdvancedControllerResult.Success -> ConfirmedMutationResult.Completed(result.value)
            is AdvancedControllerResult.Failed -> ConfirmedMutationResult.Failed(result.failure)
            AdvancedControllerResult.Stale -> ConfirmedMutationResult.Stale
        }
    }

    fun dismiss(id: Long) {
        pending.remove(id)
    }

    fun close() {
        pending.clear()
        runtime.close()
    }

    private fun capture(
        action: DestructiveAction,
        owner: ProjectLocationAdvancedOwner,
        path: String,
        call: AdvancedCall,
        reconciliation: AdvancedCall,
    ): ConfirmedMutationResult.ConfirmationRequired {
        val confirmation = DestructiveConfirmation(
            confirmationIds.incrementAndGet(),
            action,
            owner,
            path,
            call,
            reconciliation,
        )
        pending[confirmation.id] = confirmation
        return ConfirmedMutationResult.ConfirmationRequired(confirmation)
    }

    private fun readCall(
        operation: AdvancedOperation,
        owner: ProjectLocationAdvancedOwner,
        path: String,
    ) = AdvancedCall(operation, owner, AdvancedPayloads.externalRead(owner.location, path))
}

private fun siblingPath(path: String, name: String): String {
    val split = maxOf(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return if (split < 0) name else path.substring(0, split + 1) + name
}

private fun movedPath(path: String, parent: String): String {
    if (parent.isEmpty()) return path.substringAfterLast('/').substringAfterLast('\\')
    val name = path.substringAfterLast('/').substringAfterLast('\\')
    val separator = if ('\\' in parent && '/' !in parent) "\\" else "/"
    return parent.trimEnd('/', '\\') + separator + name
}

private fun resolveProjectPath(root: String, path: String): String {
    val absolute = path.startsWith('/') || path.startsWith('\\') ||
        (path.length >= 3 && path[1] == ':' && path[2] in setOf('/', '\\'))
    if (absolute) return path
    val separator = if ('\\' in root && '/' !in root) "\\" else "/"
    return root.trimEnd('/', '\\') + separator + path
}

internal fun AdvancedMutationOutcome.externalWriteResult(): ExternalFileWriteResult = when (this) {
    is AdvancedMutationOutcome.Applied -> AdvancedResultAdapters.externalWrite(result)
    is AdvancedMutationOutcome.Reconciled -> authoritativeResult?.let {
        ExternalFileWriteResult(AdvancedResultAdapters.externalFile(it).modifiedAtMs)
    } ?: throw AdvancedGatewayException(0, "outcome_unknown", true)
    AdvancedMutationOutcome.Unknown -> throw AdvancedGatewayException(0, "outcome_unknown", true)
}
