package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteClientException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Host-routed invocation boundary: lease/capability revalidation around one provider call. */
internal class RichChatGatewayInvocation(
    private val session: StateFlow<RichChatHostLease?>,
    private val provider: RichChatGatewayProvider,
) {
    internal suspend fun <T> invoke(
        lease: RichChatHostLease,
        capability: RichChatCapability,
        mutation: Boolean,
        operation: suspend RichChatGatewayBundle.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val bundle = try {
            provider.bundleFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw RichChatGatewayException(0, "network", mutation)
        } ?: throw RichChatGatewayException(409, "stale_lease", false)
        if (mutation && bundle.mutationDelivery != RichChatMutationDelivery.SingleAttempt) {
            throw RichChatGatewayException(500, "unsafe_retry_policy", false)
        }
        // B1: this bundle's connection declares the notice surface exactly when
        // the lease's live descriptor advertised it. Reads never declare on an
        // incapable host, and a declaring client is always the one that can
        // render the notice.
        bundle.core.declareRuntimeHistoryNotices(lease.noticesSupported)
        requireCurrent(lease, capability)
        val value = try {
            bundle.operation()
        } catch (error: CancellationException) {
            throw error
        } catch (error: RichChatGatewayException) {
            throw error
        } catch (error: RemoteClientException) {
            throw error.sanitized(mutation)
        } catch (error: Exception) {
            throw error.sanitized(mutation)
        }
        requireCurrent(lease, capability)
        return value
    }

    internal suspend fun <T> invokePlan(
        lease: RichChatHostLease,
        capability: RichChatCapability,
        operation: RichChatGatewayBundle.() -> T,
    ): T {
        requireCurrent(lease, capability)
        val bundle = try {
            provider.bundleFor(lease)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            throw RichChatGatewayException(0, "network", false)
        } ?: throw RichChatGatewayException(409, "stale_lease", false)
        val value = try {
            bundle.operation()
        } catch (error: RichChatGatewayException) {
            throw error
        } catch (error: Exception) {
            throw error.sanitized(false)
        }
        requireCurrent(lease, capability)
        return value
    }

    private fun requireCurrent(lease: RichChatHostLease, capability: RichChatCapability) {
        val current = session.value
        if (current == null || current.key != lease.key) {
            throw RichChatGatewayException(409, "stale_lease", false)
        }
        if (!current.online) throw RichChatGatewayException(0, "offline", false)
        if (!current.ready) throw RichChatGatewayException(409, "session_not_ready", false)
        if (capability.scope !in current.scopes) {
            throw RichChatGatewayException(403, "missing_scope", false)
        }
    }
}
