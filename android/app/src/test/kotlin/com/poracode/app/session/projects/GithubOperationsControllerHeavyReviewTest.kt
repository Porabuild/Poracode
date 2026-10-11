package com.poracode.app.session.projects

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.session.HeavyReviewTarget
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Proof the PR/review UI lifecycle drives the heavy-review presenter: opening a
 * PR detail presents the pull-request target with the review bundle, and closing
 * the surface (or a host/projects change) dismisses it so the merged Git-interest
 * set returns to passive-only.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GithubOperationsControllerHeavyReviewTest {
    private val projectId = "project-a"

    private fun target(): ProjectWorkspaceTarget =
        ProjectWorkspaceTarget(ProjectIdentity(connectionA, projectId), PosixProjectLocation("/repo"))

    private data class Recorder(var last: HeavyReviewTarget?) :
        com.poracode.app.session.HeavyReviewInterestPresenter {
        override fun present(target: HeavyReviewTarget?) {
            last = target
        }
    }

    @Test
    fun selectingPullRequestPresentsReviewBundleTarget() = runTest {
        val controller = GithubOperationsController(
            MutableStateFlow(lease()),
            FakeGithubGateway(),
        )
        val recorder = Recorder(null)
        controller.setHeavyReviewPresenter(recorder)
        controller.selectPullRequest(target(), number = 42L, branch = "feature")
        val presented = recorder.last
        assertTrue("heavy review presented", presented is HeavyReviewTarget.PullRequest)
        presented as HeavyReviewTarget.PullRequest
        assertEquals(connectionA, presented.connectionId)
        assertEquals(projectId, presented.projectId)
        assertEquals(42, presented.prNumber)
        assertEquals("feature", presented.branch)
    }

    @Test
    fun closingDetailDismissesHeavyReview() = runTest {
        val controller = GithubOperationsController(
            MutableStateFlow(lease()),
            FakeGithubGateway(),
        )
        val recorder = Recorder(null)
        controller.setHeavyReviewPresenter(recorder)
        controller.selectPullRequest(target(), number = 9L, branch = "b")
        controller.close(target().identity)
        assertNull("close dismissed heavy review", recorder.last)
    }

    @Test
    fun projectsChangedDismissesHeavyReview() = runTest {
        val controller = GithubOperationsController(
            MutableStateFlow(lease()),
            FakeGithubGateway(),
        )
        val recorder = Recorder(null)
        controller.setHeavyReviewPresenter(recorder)
        controller.selectPullRequest(target(), number = 3L, branch = "b")
        controller.onProjectsChanged(connectionA)
        assertNull("projects-changed dismissed heavy review", recorder.last)
    }
}
