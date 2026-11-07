package com.poracode.app.session.projects

import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteJson
import com.poracode.app.protocol.forge.ForgeReviewOperation
import com.poracode.app.protocol.forge.RemoteV3ForgeReviewContract
import com.poracode.app.protocol.github.GithubProcedure
import com.poracode.app.protocol.github.RemoteV3GithubContract
import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*

/** Disposable v1 snapshots; future versions are refused and never rewritten. */
class ForgeReviewDiskCache(private val directory: File) {
    private val lock = Mutex()
    private val maximumBytes = 32 * 1024 * 1024

    suspend fun read(scope: String): Map<ForgeReviewOperation, JsonElement>? = withContext(Dispatchers.IO) {
        lock.withLock {
            runCatching {
                val target = file(scope)
                if (!target.exists() || target.length() > maximumBytes) return@withLock null
                val snapshot = Json.parseToJsonElement(target.readText()) as? JsonObject ?: return@withLock null
                if (snapshot.keys != setOf("version", "scope", "documents") || snapshot["version"] != JsonPrimitive(1) || snapshot["scope"] != JsonPrimitive(scope)) return@withLock null
                (snapshot["documents"] as JsonObject).map { (name, result) ->
                    val operation = ForgeReviewOperation.entries.single { it.wireName == name }
                    check(!operation.isMutation)
                    operation to RemoteV3ForgeReviewContract.result(operation, buildJsonObject { put("result", result) }.toString())
                }.toMap()
            }.getOrNull()
        }
    }

    suspend fun write(scope: String, documents: Map<ForgeReviewOperation, JsonElement>) = withContext(Dispatchers.IO) {
        save(scope, JsonObject(documents.mapKeys { it.key.wireName }))
    }

    suspend fun readPullRequests(scope: String): JsonElement? = withContext(Dispatchers.IO) {
        lock.withLock {
            runCatching {
                val target = file(scope)
                if (!target.exists() || target.length() > maximumBytes) return@withLock null
                val snapshot = Json.parseToJsonElement(target.readText()) as? JsonObject ?: return@withLock null
                if (snapshot["version"] != JsonPrimitive(1) || snapshot["scope"] != JsonPrimitive(scope)) return@withLock null
                val result = (snapshot["documents"] as JsonObject).getValue("ghListPullRequests")
                RemoteV3GithubContract.result(GithubProcedure.ListPullRequests, buildJsonObject { put("result", result) }.toString())
            }.getOrNull()
        }
    }

    suspend fun writePullRequests(scope: String, result: JsonElement) = withContext(Dispatchers.IO) {
        save(scope, buildJsonObject { put("ghListPullRequests", result) })
    }

    private suspend fun save(scope: String, documents: JsonObject) {
        lock.withLock {
            runCatching {
                val target = file(scope)
                if (target.exists()) {
                    if (target.length() > maximumBytes || (Json.parseToJsonElement(target.readText()) as? JsonObject)?.get("version") != JsonPrimitive(1)) return@withLock
                }
                val data = buildJsonObject {
                    put("version", 1); put("scope", scope)
                    put("documents", documents)
                }.toString().toByteArray(Charsets.UTF_8)
                if (data.size > maximumBytes) return@withLock
                directory.mkdirs()
                ProductionAtomicFileWriter.writeAtomically(target, data)
                val files = directory.listFiles()?.filter { it.extension == "json" }.orEmpty()
                var excess = files.size - 32
                if (excess > 0) for (file in files.sortedBy { it.lastModified() }) {
                    if (excess <= 0) break
                    if (file == target || file.length() > maximumBytes) continue
                    val version = runCatching { (Json.parseToJsonElement(file.readText()) as? JsonObject)?.get("version") }.getOrNull()
                    if (version == JsonPrimitive(1) && file.delete()) excess--
                }
            }
            Unit
        }
    }

    private fun file(scope: String): File = File(directory, MessageDigest.getInstance("SHA-256").digest(scope.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) } + ".json")

    companion object {
        fun listScope(lease: ProjectHostLease, target: ProjectWorkspaceTarget): String? {
            val endpoint = lease.cacheEndpoint ?: return null
            val desktopId = lease.desktopId ?: return null
            return buildJsonArray {
                add(lease.connectionId.toString()); add(desktopId); add(endpoint); add(target.identity.projectId)
                add(RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), target.location)); add("pull-requests")
            }.toString()
        }
        fun scope(lease: ProjectHostLease, target: ProjectWorkspaceTarget, source: JsonObject, number: Long): String? {
            val endpoint = lease.cacheEndpoint ?: return null
            val desktopId = lease.desktopId ?: return null
            return buildJsonArray {
                add(lease.connectionId.toString()); add(desktopId); add(endpoint); add(target.identity.projectId)
                add(RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), target.location))
                add(source["account"] ?: return null); add(source["repository"] ?: return null); add(number)
            }.toString()
        }
    }
}
