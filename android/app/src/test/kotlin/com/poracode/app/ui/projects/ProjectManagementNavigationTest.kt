package com.poracode.app.ui.projects

import com.poracode.app.ui.projects.workspace.ProjectGithubSection
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceSection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProjectManagementNavigationTest {
    @Test
    fun detailAndNotesDoNotOpenWorkspace() {
        assertNull(ProjectManagementDestination.Detail.workspaceEntryPoint())
        assertNull(ProjectManagementDestination.Notes.workspaceEntryPoint())
    }

    @Test
    fun pullRequestsOpenTheGithubPullRequestSection() {
        assertEquals(
            ProjectWorkspaceEntryPoint(
                ProjectWorkspaceSection.Github,
                ProjectGithubSection.PullRequests,
            ),
            ProjectManagementDestination.PullRequests.workspaceEntryPoint(),
        )
    }

    @Test
    fun actionsOpenTheGithubActionsSection() {
        assertEquals(
            ProjectWorkspaceEntryPoint(
                ProjectWorkspaceSection.Github,
                ProjectGithubSection.Actions,
            ),
            ProjectManagementDestination.GithubActions.workspaceEntryPoint(),
        )
    }

    @Test
    fun directDestinationSelectionCanBeReappliedAfterAHostLeaseReplacement() {
        assertEquals(
            ProjectManagementSelection("project-a", "project-a"),
            projectManagementSelection(
                "project-a",
                ProjectManagementDestination.GithubActions,
            ),
        )
        assertEquals(
            ProjectManagementSelection("project-a", null),
            projectManagementSelection("project-a", ProjectManagementDestination.Notes),
        )
        assertEquals(
            ProjectManagementSelection(null, null),
            projectManagementSelection(null, ProjectManagementDestination.Detail),
        )
    }
}
