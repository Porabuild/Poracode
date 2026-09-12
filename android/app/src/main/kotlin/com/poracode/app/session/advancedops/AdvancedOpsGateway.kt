package com.poracode.app.session.advancedops

import com.poracode.app.protocol.advancedops.AdvancedCallKind
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.protocol.advancedops.toAdvancedWireLocation
import com.poracode.app.transport.advancedops.AdvancedOpsTransport
import com.poracode.app.transport.advancedops.AdvancedTransportException
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

data class AdvancedCall(
    val operation: AdvancedOperation,
    val owner: AdvancedOperationOwner,
    val payload: JsonObject,
)

sealed interface AdvancedMutationOutcome {
    data class Applied(val result: JsonElement) : AdvancedMutationOutcome
    data class Reconciled(val authoritativeResult: JsonElement?) : AdvancedMutationOutcome
    data object Unknown : AdvancedMutationOutcome
}

class AdvancedGatewayException(
    val statusCode: Int?,
    val safeCode: String,
    val mayHaveCommitted: Boolean,
    cause: Throwable? = null,
) : Exception("Advanced operation failed.", cause)

interface AdvancedOpsGateway {
    suspend fun read(call: AdvancedCall): JsonElement
    suspend fun mutate(call: AdvancedCall, reconciliation: AdvancedCall? = null): AdvancedMutationOutcome
}

/** Exact-owner gateway with latest lease checks and per-owner serialized, one-attempt mutations. */
class GeneratedAdvancedOpsGateway(
    private val owners: StateFlow<AdvancedOwnerSnapshot>,
    private val transport: AdvancedOpsTransport,
) : AdvancedOpsGateway {
    private val mutationLocks = ConcurrentHashMap<String, Mutex>()

    override suspend fun read(call: AdvancedCall): JsonElement {
        check(call.operation.callKind == AdvancedCallKind.Read)
        requireCurrent(call)
        return invoke(call, mutation = false).also { requireCurrent(call) }
    }

    override suspend fun mutate(
        call: AdvancedCall,
        reconciliation: AdvancedCall?,
    ): AdvancedMutationOutcome {
        check(call.operation.callKind == AdvancedCallKind.Mutation)
        return mutationLocks.getOrPut(call.owner.serializationKey) { Mutex() }.withLock {
            requireCurrent(call)
            try {
                val value = invoke(call, mutation = true)
                requireCurrent(call)
                AdvancedMutationOutcome.Applied(value)
            } catch (error: AdvancedGatewayException) {
                if (!error.mayHaveCommitted) throw error
                requireCurrent(call)
                if (reconciliation == null) return@withLock AdvancedMutationOutcome.Unknown
                val authoritative = try {
                    requireCurrent(reconciliation)
                    invoke(reconciliation, mutation = false).also { requireCurrent(reconciliation) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    null
                }
                AdvancedMutationOutcome.Reconciled(authoritative)
            }
        }
    }

    private suspend fun invoke(call: AdvancedCall, mutation: Boolean): JsonElement = try {
        transport.call(call.operation, call.payload)
    } catch (error: CancellationException) {
        throw error
    } catch (error: AdvancedTransportException) {
        throw AdvancedGatewayException(
            error.statusCode,
            error.safeCode,
            mutation && error.ambiguity,
            error,
        )
    } catch (error: AdvancedGatewayException) {
        throw error
    } catch (error: Exception) {
        throw AdvancedGatewayException(0, "network", mutation, error)
    }

    private fun requireCurrent(call: AdvancedCall) {
        val owner = call.owner
        if (call.operation.owner != owner.kind) invalid("invalid_owner")
        val snapshot = owners.value
        if (!snapshot.foreground) invalid("background", 0)
        val currentHost = snapshot.host
        if (currentHost == null || currentHost.key != owner.host.key) invalid("stale_owner", 409)
        if (!currentHost.online) invalid("offline", 0)
        if (!currentHost.ready) invalid("session_not_ready", 409)
        if (!snapshot.isSelected(owner)) invalid("stale_owner", 409)
        if (call.operation.scope !in owner.host.scopes) invalid("missing_scope", 403)
        when (owner) {
            is ThreadAdvancedOwner -> {
                if (call.payload["threadId"]?.jsonPrimitive?.content != owner.threadId) {
                    invalid("invalid_thread_owner")
                }
                call.payload["projectLocation"]?.let {
                    if (it != owner.location.toAdvancedWireLocation()) invalid("invalid_location_owner")
                }
            }
            is ProjectLocationAdvancedOwner -> if (
                call.payload["projectLocation"] != owner.location.toAdvancedWireLocation()
            ) {
                invalid("invalid_project_owner")
            }
            is LocationAdvancedOwner -> if (
                call.payload["location"] != owner.location.toAdvancedWireLocation()
            ) {
                invalid("invalid_location_owner")
            }
        }
    }

    private fun invalid(code: String, status: Int = 400): Nothing =
        throw AdvancedGatewayException(status, code, false)
}
