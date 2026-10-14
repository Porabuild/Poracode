package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.RemoteEnvironmentPairing
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.EnvironmentIdentityChangedException
import com.poracode.app.storage.EnvironmentNestedParentException
import com.poracode.app.storage.EnvironmentParentMissingException
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * Explicit device pairing for one host-owned environment (C1, R2).
 *
 * The parent mints a one-time child pairing credential through its own route;
 * this coordinator exchanges it through the parent proxy prefix with BOTH
 * authorities (child credential exchange is unauthenticated, the parent header
 * is attached by the explicit authority), verifies the child desktopId against
 * the returned descriptor, and commits a local environment record whose child
 * grant lives in its own vault account. The parent's TLS pin is reused — no
 * child fingerprint is ever registered.
 *
 * Pairing always requires a direct/ssh parent: an environment can never be the
 * parent of another environment (no second proxied hop), and a child identity
 * that contradicts an existing local record refuses without repointing.
 */
class EnvironmentPairingCoordinator(
    private val repository: MultiHostCredentialRepository,
    private val authorityFactory: CatalogEnvironmentAuthorityFactory,
    private val ioDispatcher: CoroutineDispatcher,
) {
    sealed class Outcome {
        data class Paired(val connectionId: ClientConnectionId) : Outcome()
        data class Failed(val reason: Failure) : Outcome()

        fun connectionIdOrNull(): ClientConnectionId? = (this as? Paired)?.connectionId
    }

    enum class Failure {
        ParentNotPaired,
        ParentIsEnvironment,
        ChildIdentityMismatch,
        ProtocolMismatch,
        NoScopes,
        CredentialRejected,
        CommitFailed,
    }

    suspend fun pairDevice(
        parent: HostRecord,
        pairing: RemoteEnvironmentPairing,
        label: String,
    ): Outcome = withContext(ioDispatcher) {
        if (parent.environment != null) return@withContext Outcome.Failed(Failure.ParentIsEnvironment)
        val existing = repository.catalogSnapshot().hosts.firstOrNull { host ->
            host.environment?.parentConnectionId == parent.connectionId &&
                host.environment.environmentId == pairing.environmentId
        }
        val recordedChild = existing?.environment?.childDesktopId
        if (recordedChild != null && recordedChild != pairing.childDesktopId) {
            return@withContext Outcome.Failed(Failure.ChildIdentityMismatch)
        }
        val endpoint = resolveProxyEndpoint(parent, pairing.endpoint)
            ?: return@withContext Outcome.Failed(Failure.ParentNotPaired)
        val authority = authorityFactory.forPairing(
            parent = parent,
            environmentId = pairing.environmentId,
            childDesktopId = pairing.childDesktopId,
        )
        val client = RemoteApiClient(
            endpoint = endpoint,
            accessToken = null,
            explicitEnvironmentAuthority = authority,
        )
        val handshake = try {
            val descriptor = client.environment()
            if (descriptor.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
                return@withContext Outcome.Failed(Failure.ProtocolMismatch)
            }
            if (descriptor.desktopId != pairing.childDesktopId) {
                return@withContext Outcome.Failed(Failure.ChildIdentityMismatch)
            }
            val requestedScopes = RemoteAccessScopes.scopesToRequest(descriptor.auth.scopes)
            if (requestedScopes.isEmpty()) {
                return@withContext Outcome.Failed(Failure.NoScopes)
            }
            val result = client.exchangePairingCredential(
                pairing.pairingCredential,
                scopes = requestedScopes,
            )
            client.setAccessToken(result.accessToken)
            val capabilities = runCatching { client.describeHost() }
                .getOrDefault(HostServiceCapabilities.UNKNOWN)
            ChildHandshake(descriptor, result.accessToken, result.expiresAt, result.scopes, capabilities)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            return@withContext Outcome.Failed(Failure.CredentialRejected)
        }
        val descriptor = handshake.descriptor
        val profile = ConnectionProfile(
            desktopId = pairing.childDesktopId,
            label = label.trim().ifEmpty { parent.label },
            httpBaseUrl = endpoint,
            wsBaseUrl = PairingUrl.toWebSocketBaseUrl(endpoint),
            appVersion = descriptor.appVersion,
            hostMode = descriptor.hostMode,
            platform = descriptor.platform,
            scopes = handshake.scopes,
            tokenExpiresAt = handshake.expiresAt,
            pairedAtEpochMs = System.currentTimeMillis(),
            protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
            browserForwardVersions = descriptor.capabilities?.browserForward?.versions.orEmpty(),
            sshEnvironmentsVersions = descriptor.capabilities?.sshEnvironments?.versions.orEmpty(),
            // Parent pin only: the proxy endpoint is the parent host:port, and a
            // child fingerprint is never registered as a pin.
            certFingerprint = parent.certFingerprint,
            hostCapabilities = handshake.capabilities,
            environment = EnvironmentHostReference(
                parentConnectionId = parent.connectionId,
                environmentId = pairing.environmentId,
                childDesktopId = pairing.childDesktopId,
            ),
        )
        val durable = repository.beginDurableOperation(DurableOperationToken.Kind.Pair)
        val outcome = try {
            withContext(NonCancellable) {
                repository.commit(profile, handshake.accessToken, owning = durable)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            return@withContext Outcome.Failed(classify(error))
        }
        if (!outcome.applied) return@withContext Outcome.Failed(Failure.CommitFailed)
        val snapshot = repository.catalogSnapshot()
        val committed = snapshot.hosts.firstOrNull { host ->
            host.environment?.parentConnectionId == parent.connectionId &&
                host.environment.environmentId == pairing.environmentId &&
                host.desktopId == pairing.childDesktopId
        } ?: return@withContext Outcome.Failed(Failure.CommitFailed)
        Outcome.Paired(committed.connectionId)
    }

    private fun classify(error: Exception): Failure = when (error) {
        is EnvironmentIdentityChangedException -> Failure.ChildIdentityMismatch
        is EnvironmentNestedParentException -> Failure.ParentIsEnvironment
        is EnvironmentParentMissingException -> Failure.ParentNotPaired
        else -> Failure.CommitFailed
    }

    /**
     * Resolves the parent-relative proxy path against the current parent base
     * URL. An absolute or shape-foreign endpoint is refused — the client never
     * composes a child host or port, and a second proxy hop can never be built.
     */
    private fun resolveProxyEndpoint(parent: HostRecord, endpoint: String): String? {
        if (parent.httpBaseUrl.isBlank()) return null
        if (!endpoint.startsWith("/api/environments/")) return null
        if (!endpoint.contains("/proxy/")) return null
        return (parent.httpBaseUrl.trimEnd('/') + endpoint).trimEnd('/')
    }

    private data class ChildHandshake(
        val descriptor: com.poracode.app.model.RemoteEnvironmentDescriptor,
        val accessToken: String,
        val expiresAt: String,
        val scopes: List<String>,
        val capabilities: HostServiceCapabilities,
    )
}
