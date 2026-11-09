package com.poracode.app.session.replay

import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.GitStateSnapshot
import com.poracode.app.model.GitSummaryTargetKey
import com.poracode.app.model.RemoteGitSummary

/**
 * Memoized decode of `gitState` targets into the per-target Git summary index.
 * The replay cache swaps the snapshot object only on a real change, so a
 * reference check rebuilds the index exactly once per gitState revision and
 * keeps JSON decoding off the composition path.
 */
class GitSummaryIndexCache {
    private var source: GitStateSnapshot? = null
    private var index: Map<GitSummaryTargetKey, RemoteGitSummary> = emptyMap()

    fun indexFor(snapshot: GitStateSnapshot): Map<GitSummaryTargetKey, RemoteGitSummary> {
        if (snapshot !== source) {
            source = snapshot
            index = GitStateJsonAdapter.decodeTargetSummaries(snapshot)
        }
        return index
    }
}
