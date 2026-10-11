package com.poracode.app.ui

import com.poracode.app.model.RemoteGitPrSummary
import com.poracode.app.model.RemoteGitSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Format and accessibility behavior for [GitSummaryFormatter]: not-a-repo,
 * branch-only, ahead/behind, additions/deletions, and PR labels are all
 * truthful and composed only from the parts that carry signal.
 */
class GitSummaryFormatterTest {
    private val templates = GitSummaryFormatter.GitSummaryTemplates(
        aheadBehind = "%1\$d ahead, %2\$d behind",
        additionsDeletions = "+%1\$d / −%2\$d",
        notRepo = "Not a repository",
        pullRequest = "Pull request #%1\$d",
        stateDescription = "Branch %1\$s, %2\$d commits ahead and %3\$d commits behind remote.",
    )

    @Test
    fun nullSummaryIsEmpty() {
        assertEquals("", GitSummaryFormatter.compact(null, templates))
        assertEquals("", GitSummaryFormatter.stateDescription(null, templates))
    }

    @Test
    fun notARepoSurfacesNotRepo() {
        val summary = repo(isRepo = false)
        assertEquals("Not a repository", GitSummaryFormatter.compact(summary, templates))
        assertEquals("Not a repository", GitSummaryFormatter.stateDescription(summary, templates))
    }

    @Test
    fun repoWithBranchAndDiffComposesAllSignalParts() {
        val summary = repo(
            branch = "feature/x",
            ahead = 2,
            behind = 1,
            insertions = 12,
            deletions = 3,
            pr = RemoteGitPrSummary(number = 314, state = "open", title = "T", url = "u", isDraft = false, checksStatus = null),
        )
        val compact = GitSummaryFormatter.compact(summary, templates)
        assertTrue(compact.contains("feature/x"))
        assertTrue(compact.contains("2 ahead, 1 behind"))
        assertTrue(compact.contains("+12 / −3"))
        assertTrue(compact.contains("Pull request #314"))
        val description = GitSummaryFormatter.stateDescription(summary, templates)
        assertTrue(description.contains("Branch feature/x"))
        assertTrue(description.contains("2 commits ahead"))
        assertTrue(description.contains("Pull request #314"))
    }

    @Test
    fun repoWithoutDiffShowsOnlyBranch() {
        val summary = repo(branch = "main", ahead = 0, behind = 0, insertions = 0, deletions = 0, pr = null)
        assertEquals("main", GitSummaryFormatter.compact(summary, templates))
    }

    private fun repo(
        isRepo: Boolean = true,
        branch: String = "main",
        ahead: Int = 0,
        behind: Int = 0,
        insertions: Int = 0,
        deletions: Int = 0,
        pr: RemoteGitPrSummary? = null,
    ) = RemoteGitSummary(
        isRepo = isRepo,
        branch = branch,
        totalInsertions = insertions,
        totalDeletions = deletions,
        ahead = ahead,
        behind = behind,
        pr = pr,
    )
}
