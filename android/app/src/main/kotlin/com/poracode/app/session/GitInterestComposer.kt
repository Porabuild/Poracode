package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.git.GitInterest
import com.poracode.app.protocol.git.GitInterestPolicy

/**
 * Merges passive Git-target interests (selection-then-active-turns, archived
 * excluded, max four — the desktop TS authority via [GitInterestPolicy]) with the
 * single heavy-review interest a visible PR/review surface owns. The heavy-review
 * variant is bound to the exact host ([connectionId]) and supersedes any passive
 * target for the same project so it always fits within the max-four cap. Output
 * ordering is deterministic: heavy review first, then passive targets in policy
 * order. No second socket, no retry loop — callers flush the merged list on the
 * single authenticated socket.
 */
object GitInterestComposer {
    fun compose(
        threads: List<RemoteThread>,
        selectedThreadId: String?,
        connectionId: ClientConnectionId?,
        heavyReview: HeavyReviewTarget?,
    ): List<GitInterest> {
        val passive = GitInterestPolicy.buildPassiveTargetInterests(
            threads = threads.map(::interestThread),
            options = GitInterestPolicy.PassiveOptions(selectedThreadId = selectedThreadId),
        )
        val heavy = heavyInterest(heavyReview, connectionId) ?: return passive
        val heavyProject = heavy.projectId()
        val filtered = if (heavyProject != null) {
            passive.filterNot { it is GitInterest.Target && it.projectId == heavyProject }
        } else {
            passive
        }
        val combined = ArrayList<GitInterest>(filtered.size + 1)
        combined += heavy
        for (interest in filtered) {
            if (combined.size >= GitInterestPolicy.MAX_REMOTE_GIT_TARGET_INTERESTS) break
            combined += interest
        }
        return combined
    }

    private fun heavyInterest(
        target: HeavyReviewTarget?,
        connectionId: ClientConnectionId?,
    ): GitInterest? {
        if (target == null || connectionId == null) return null
        if (target.connectionId != connectionId) return null
        return when (target) {
            is HeavyReviewTarget.PullRequest -> GitInterest.PullRequest(
                projectId = target.projectId,
                prNumber = target.prNumber,
                branch = target.branch,
                includeReviewBundle = true,
            )
            is HeavyReviewTarget.ProjectList -> GitInterest.ProjectPullRequests(target.projectId)
        }
    }

    private fun GitInterest.projectId(): String? = when (this) {
        is GitInterest.Target -> projectId
        is GitInterest.PullRequest -> projectId
        is GitInterest.ProjectPullRequests -> projectId
    }

    private fun interestThread(thread: RemoteThread): GitInterestPolicy.GitInterestThread =
        GitInterestPolicy.GitInterestThread(
            id = thread.id,
            projectId = thread.projectId,
            worktreePath = thread.worktreePath,
            status = thread.status,
            archived = thread.isArchived,
            updatedAt = thread.updatedAt,
        )
}
