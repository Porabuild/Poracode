package com.poracode.app.ui

import com.poracode.app.model.GitSummaryTargetKey
import com.poracode.app.model.RemoteGitSummary
import com.poracode.app.model.RemoteThread

/**
 * Resolves the compact per-thread Git summary shown on home rows and the
 * rich-chat header. The published `gitSummariesByThread` map is preferred; when
 * it has no entry for the thread (standalone hosts have no renderer publisher,
 * so the map is often empty), falls back to the precomputed `gitState` target
 * index for the thread's project + worktree — the same fallback the iOS thread
 * surface uses. Both inputs are plain maps: no JSON decoding happens here.
 */
object GitSummaryResolver {

    fun forThread(
        thread: RemoteThread,
        summaries: Map<String, RemoteGitSummary>,
        targetSummaries: Map<GitSummaryTargetKey, RemoteGitSummary>,
    ): RemoteGitSummary? {
        summaries[thread.id]?.let { return it }
        val worktree = thread.worktreePath?.takeIf { it.isNotEmpty() }
        return targetSummaries[GitSummaryTargetKey(thread.projectId, worktree)]
    }
}
