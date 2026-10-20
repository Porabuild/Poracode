package com.poracode.app.session.projects

import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.forge.ForgeReviewOperation
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*

data class ForgeReviewEntry(
    val number: Long = 0,
    val source: JsonObject? = null,
    val documents: Map<ForgeReviewOperation, JsonElement> = emptyMap(),
    val loading: Boolean = false,
    val mutating: Boolean = false,
    val failure: ProjectOperationFailure? = null,
    val isCached: Boolean = false,
    val owner: ProjectSessionKey? = null,
) {
    val capabilities: JsonObject get() = source?.get("capabilities") as? JsonObject ?: JsonObject(emptyMap())
    val viewerLogin: String? get() = ((source?.get("account") as? JsonObject)?.get("login") as? JsonPrimitive)?.content
    private val displayedDiffHash: String? by lazy {
        ((documents[ForgeReviewOperation.GetPrDiff] as? JsonObject)?.get("diff") as? JsonPrimitive)?.content?.let { diff ->
            MessageDigest.getInstance("SHA-256").digest(diff.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }
    }

    fun fingerprint(path: String): String? {
        val marks = documents[ForgeReviewOperation.GetPrViewedFiles] as? JsonObject ?: return null
        if (marks["storage"] == JsonPrimitive("forge")) return "VIEWED"
        if (!matchesDisplayedDiff(marks)) return null
        return findFingerprint(marks["currentFiles"], path)
    }

    fun matchesDisplayedDiff(value: JsonObject): Boolean {
        val hash = displayedDiffHash ?: return false
        return value["diffHash"] == JsonPrimitive(hash)
    }

    fun viewedState(path: String): String? {
        val marks = documents[ForgeReviewOperation.GetPrViewedFiles] as? JsonObject ?: return null
        val saved = findFingerprint(marks["files"], path) ?: return null
        return if (saved == fingerprint(path)) "viewed" else "changed"
    }

    private fun findFingerprint(value: JsonElement?, path: String): String? =
        (value as? JsonArray)?.mapNotNull { it as? JsonObject }?.firstOrNull {
            it["path"] == JsonPrimitive(path)
        }?.let { (it["fingerprint"] as? JsonPrimitive)?.content }
}

/** Scoped review reads and single-delivery writes; stale account/project responses are discarded. */
class ForgeReviewController(
    private val session: StateFlow<ProjectHostLease?>,
    private val gateway: ForgeReviewGateway?,
    private val cache: ForgeReviewDiskCache? = null,
) {
    private val revisions = ConcurrentHashMap<ProjectIdentity, AtomicLong>()
    private val locks = ConcurrentHashMap<ProjectIdentity, Mutex>()
    private val mutableState = MutableStateFlow<Map<ProjectIdentity, ForgeReviewEntry>>(emptyMap())
    val state = mutableState.asStateFlow()

    suspend fun select(target: ProjectWorkspaceTarget, source: JsonObject, number: Long) {
        val lease = session.value ?: return
        if (ProjectCapability.Read.scope !in lease.scopes) return
        val owner = revisions.getOrPut(target.identity) { AtomicLong() }.incrementAndGet()
        update(target.identity) {
            if (it.source == source && it.number == number && it.owner == lease.key) it.copy(loading = false, mutating = false)
            else ForgeReviewEntry(number = number, source = source, owner = lease.key)
        }
        val scope = ForgeReviewDiskCache.scope(lease, target, source, number)
        if (scope != null && state.value[target.identity]?.documents.isNullOrEmpty()) {
            val documents = cache?.read(scope)
            if (session.value?.key != lease.key || revisions[target.identity]?.get() != owner) return
            if (documents != null) update(target.identity) { it.copy(documents = documents, isCached = true) }
        }
        if (!lease.online || !lease.ready) return
        refresh(target)
    }

    suspend fun refresh(target: ProjectWorkspaceTarget) {
        val entry = state.value[target.identity] ?: return
        if (entry.mutating) return
        val (lease, failure) = session.currentLease(ProjectCapability.Read)
        if (lease == null || failure != null || gateway == null) {
            update(target.identity) { it.copy(failure = failure ?: ProjectOperationFailure.NoSession) }
            return
        }
        val owner = revisions.getOrPut(target.identity) { AtomicLong() }.incrementAndGet()
        update(target.identity) { it.copy(loading = true, failure = null) }
        try {
            val operations = mutableListOf(ForgeReviewOperation.GetPrDetails, ForgeReviewOperation.GetPrFiles,
                ForgeReviewOperation.GetPrDiff, ForgeReviewOperation.GetPrReviewComments)
            if (entry.capabilities["viewedFiles"] is JsonPrimitive) operations += ForgeReviewOperation.GetPrViewedFiles
            if (entry.capabilities["reviewGuides"] == JsonPrimitive(true)) operations += ForgeReviewOperation.GetPrReviewGuide
            val documents = linkedMapOf<ForgeReviewOperation, JsonElement>()
            for (operation in operations) {
                documents[operation] = gateway.callForge(lease, target, operation, payload(target, entry))
                if (!owns(lease, target.identity, owner)) return
            }
            update(target.identity) { it.copy(documents = documents, loading = false, isCached = false) }
            entry.source?.let { source -> ForgeReviewDiskCache.scope(lease, target, source, entry.number)?.let { cache?.write(it, documents) } }
        } catch (error: CancellationException) {
            if (owns(lease, target.identity, owner)) update(target.identity) { it.copy(loading = false) }
            throw error
        } catch (error: Exception) {
            if (owns(lease, target.identity, owner)) update(target.identity) {
                it.copy(loading = false, failure = error.asProjectFailure(ProjectCapability.Read, false))
            }
        }
    }

    suspend fun refreshGuide(target: ProjectWorkspaceTarget) {
        val entry = state.value[target.identity] ?: return
        if (entry.loading || entry.mutating || gateway == null) return
        val (lease, failure) = session.currentLease(ProjectCapability.Read)
        if (lease == null || failure != null) return
        val owner = revisions[target.identity]?.get() ?: return
        try {
            val result = gateway.callForge(lease, target, ForgeReviewOperation.GetPrReviewGuide, payload(target, entry))
            if (owns(lease, target.identity, owner)) {
                update(target.identity) { it.copy(documents = it.documents + (ForgeReviewOperation.GetPrReviewGuide to result)) }
                persist(lease, target)
            }
        } catch (error: CancellationException) { throw error }
        catch (error: Exception) {
            if (owns(lease, target.identity, owner)) update(target.identity) {
                it.copy(failure = error.asProjectFailure(ProjectCapability.Read, false))
            }
        }
    }

    suspend fun mutate(target: ProjectWorkspaceTarget, expected: ForgeReviewEntry,
        operation: ForgeReviewOperation, fields: Map<String, JsonElement>): Boolean =
        locks.getOrPut(target.identity) { Mutex() }.withLock {
            val entry = state.value[target.identity] ?: return@withLock false
            if (entry.source != expected.source || entry.number != expected.number || entry.owner != expected.owner || entry.isCached || entry.loading || entry.mutating || !operation.isMutation) return@withLock false
            val (lease, failure) = session.currentLease(ProjectCapability.Operate)
            if (lease == null || failure != null || gateway == null) {
                update(target.identity) { it.copy(failure = failure ?: ProjectOperationFailure.NoSession) }
                return@withLock false
            }
            val owner = revisions.getOrPut(target.identity) { AtomicLong() }.incrementAndGet()
            update(target.identity) { it.copy(mutating = true, failure = null) }
            try {
                val result = gateway.callForge(lease, target, operation, payload(target, entry, fields))
                if (!owns(lease, target.identity, owner)) return@withLock false
                update(target.identity) {
                    val resultKey = when (operation) {
                        ForgeReviewOperation.SetPrFileViewed -> ForgeReviewOperation.GetPrViewedFiles
                        ForgeReviewOperation.WritePrReviewGuide -> ForgeReviewOperation.GetPrReviewGuide
                        else -> null
                    }
                    it.copy(mutating = false, documents = if (resultKey == null) it.documents else it.documents + (resultKey to result))
                }
                if (operation != ForgeReviewOperation.SetPrFileViewed && operation != ForgeReviewOperation.WritePrReviewGuide) refresh(target)
                else persist(lease, target)
                true
            } catch (error: CancellationException) {
                if (owns(lease, target.identity, owner)) update(target.identity) { it.copy(mutating = false) }
                throw error
            } catch (error: Exception) {
                if (owns(lease, target.identity, owner)) update(target.identity) {
                    it.copy(mutating = false, failure = error.asProjectFailure(ProjectCapability.Operate, false))
                }
                false
            }
        }

    fun close(identity: ProjectIdentity) {
        revisions[identity]?.incrementAndGet()
        mutableState.update { it - identity }
    }

    fun clear(connectionId: com.poracode.app.model.ClientConnectionId) {
        revisions.filterKeys { it.connectionId == connectionId }.values.forEach { it.incrementAndGet() }
        mutableState.update { entries -> entries.filterKeys { it.connectionId != connectionId } }
    }

    private suspend fun persist(lease: ProjectHostLease, target: ProjectWorkspaceTarget) {
        val entry = state.value[target.identity] ?: return
        val source = entry.source ?: return
        ForgeReviewDiskCache.scope(lease, target, source, entry.number)?.let { cache?.write(it, entry.documents) }
    }

    private fun payload(target: ProjectWorkspaceTarget, entry: ForgeReviewEntry,
        fields: Map<String, JsonElement> = emptyMap()): JsonObject {
        val source = requireNotNull(entry.source)
        return JsonObject(fields + mapOf("projectLocation" to RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), target.location),
            "prNumber" to JsonPrimitive(entry.number), "forgeAccount" to source.getValue("account"),
            "forgeRepository" to source.getValue("repository")))
    }

    private fun owns(lease: ProjectHostLease, identity: ProjectIdentity, owner: Long) =
        session.isCurrent(lease) && revisions[identity]?.get() == owner

    private fun update(identity: ProjectIdentity, change: (ForgeReviewEntry) -> ForgeReviewEntry) {
        mutableState.update { it + (identity to change(it[identity] ?: ForgeReviewEntry())) }
    }
}
