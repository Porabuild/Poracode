package com.poracode.app.protocol.git

/**
 * Passive Git-target interest selection — port of
 * `src/shared/gitStateInterestPolicy.ts`. Selection wins, then live turns,
 * deduplicated by `projectId + worktreePath`; archived threads are excluded;
 * capped at [MAX_REMOTE_GIT_TARGET_INTERESTS]. No polling: callers flush the
 * latest desired set on socket ready/reconnect.
 */
object GitInterestPolicy {
    const val MAX_REMOTE_GIT_TARGET_INTERESTS = 4

    /** Thread-shaped demand used to derive passive target interests. */
    data class GitInterestThread(
        val id: String,
        val projectId: String,
        val worktreePath: String?,
        val status: String,
        val archived: Boolean,
        val updatedAt: String,
    )

    data class PassiveOptions(
        val selectedThreadId: String?,
        val limit: Int = MAX_REMOTE_GIT_TARGET_INTERESTS,
    )

    fun buildPassiveTargetInterests(
        threads: List<GitInterestThread>,
        options: PassiveOptions,
    ): List<GitInterest> {
        val limit = options.limit.coerceAtLeast(0)
        if (limit == 0) return emptyList()
        val available = threads
            .filter { !it.archived }
            .sortedByDescending { it.updatedAt }
        val selected = options.selectedThreadId?.let { id -> available.firstOrNull { it.id == id } }
        val active = available.filter { thread ->
            thread.id != selected?.id && isThreadTurnActive(thread.status)
        }
        val candidates = (selected?.let { listOf(it) } ?: emptyList()) + active

        val interests = ArrayList<GitInterest>()
        val seen = HashSet<String>()
        for (thread in candidates) {
            val key = "${thread.projectId}\u0000${thread.worktreePath ?: ""}"
            if (!seen.add(key)) continue
            interests += GitInterest.Target(
                projectId = thread.projectId,
                worktreePath = thread.worktreePath,
                includePrDetails = true,
            )
            if (interests.size >= limit) break
        }
        return interests
    }

    /** "Turn-active" matches the desktop contract (launching/working/needs_*). */
    fun isThreadTurnActive(status: String): Boolean =
        status == "launching" ||
            status == "working" ||
            status == "needs_approval" ||
            status == "needs_reply"
}

/**
 * The three v3 Git-interest variants plus exact-empty clear. Wire encoding is
 * centralized in [com.poracode.app.transport.ws.WsGitInterestEncoder]; this
 * hierarchy is the stable in-memory representation.
 */
sealed class GitInterest {
    data class Target(
        val projectId: String,
        val worktreePath: String? = null,
        val branch: String? = null,
        val includePrDetails: Boolean? = null,
    ) : GitInterest()

    data class PullRequest(
        val projectId: String,
        val prNumber: Int,
        val branch: String? = null,
        val includeReviewBundle: Boolean? = null,
    ) : GitInterest()

    data class ProjectPullRequests(
        val projectId: String,
    ) : GitInterest()
}
