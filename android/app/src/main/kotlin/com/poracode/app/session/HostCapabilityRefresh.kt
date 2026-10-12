package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteApiGatewayFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * C1 capability freshness on the normal connect/metadata flow.
 *
 * A record's stored `sshEnvironmentsVersions`/`browserForwardVersions` were a
 * pairing-time snapshot; without a refresh a server upgrade stays hidden until
 * the user re-pairs. After a successful connect the live descriptor (an
 * authoritative answer, absence included) is observed and persisted through an
 * identity-fenced metadata mutation:
 *
 * - a failed fetch never mutates anything, so known capabilities are never
 *   erased by a transport/server error;
 * - a stale result (record removed, or re-paired since the fetch started) is
 *   rejected by the catalog's `expectedPairedAtEpochMs`/`expectedDesktopId`
 *   check, so it cannot update the wrong generation;
 * - `hostCapabilities` only updates from a trustworthy describe (`null` means
 *   the fetch failed and is ignored).
 */
class HostCapabilityRefresh(
    private val repository: MultiHostCredentialRepository,
    private val apiFactory: RemoteApiGatewayFactory,
    private val ioDispatcher: CoroutineDispatcher,
    private val isForeground: () -> Boolean,
    private val hasEndpointPermission: (String) -> Boolean,
) {
    /** Returns true when a metadata mutation was actually applied. */
    suspend fun refresh(
        connectionId: ClientConnectionId,
        credentials: SessionCredentials,
    ): Boolean {
        if (!isForeground()) return false
        if (credentials.profile.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            return false
        }
        if (!hasEndpointPermission(credentials.profile.httpBaseUrl)) return false
        val observed = withContext(ioDispatcher) { observe(credentials) } ?: return false
        val receipt = repository.beginHostOperation(HostOperationKind.Rename)
        return withContext(ioDispatcher) {
            repository.updateHostCapabilities(
                id = connectionId,
                expectedPairedAtEpochMs = credentials.profile.pairedAtEpochMs,
                expectedDesktopId = credentials.profile.desktopId,
                browserForwardVersions = observed.browserForwardVersions,
                sshEnvironmentsVersions = observed.sshEnvironmentsVersions,
                hostCapabilities = observed.hostCapabilities,
                owning = receipt,
            )
        } == HostMutationResult.Applied
    }

    private suspend fun observe(credentials: SessionCredentials): Observed? {
        val api = try {
            apiFactory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            return null
        }
        val descriptor = try {
            api.environment()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            return null
        }
        val describe = try {
            api.describeHostOrNull()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            null
        }
        return Observed(
            browserForwardVersions = descriptor.capabilities?.browserForward?.versions.orEmpty(),
            sshEnvironmentsVersions = descriptor.capabilities?.sshEnvironments?.versions.orEmpty(),
            hostCapabilities = describe,
        )
    }

    private data class Observed(
        val browserForwardVersions: List<Int>,
        val sshEnvironmentsVersions: List<Int>,
        val hostCapabilities: com.poracode.app.model.HostServiceCapabilities?,
    )
}
