package com.poracode.app.ui.projects

import com.poracode.app.ui.projects.workspace.ProjectGithubSection
import com.poracode.app.ui.projects.workspace.ProjectWorkspaceSection

enum class ProjectManagementDestination {
    Detail,
    Notes,
    PullRequests,
    GithubActions,
}

data class ProjectWorkspaceEntryPoint(
    val workspaceSection: ProjectWorkspaceSection,
    val githubSection: ProjectGithubSection,
)

data class ProjectManagementSelection(
    val selectedProjectId: String?,
    val workspaceProjectId: String?,
)

fun projectManagementSelection(
    initialProjectId: String?,
    destination: ProjectManagementDestination,
): ProjectManagementSelection = ProjectManagementSelection(
    selectedProjectId = initialProjectId,
    workspaceProjectId = initialProjectId.takeIf { destination.workspaceEntryPoint() != null },
)

fun ProjectManagementDestination.workspaceEntryPoint(): ProjectWorkspaceEntryPoint? = when (this) {
    ProjectManagementDestination.Detail,
    ProjectManagementDestination.Notes,
    -> null
    ProjectManagementDestination.PullRequests -> ProjectWorkspaceEntryPoint(
        ProjectWorkspaceSection.Github,
        ProjectGithubSection.PullRequests,
    )
    ProjectManagementDestination.GithubActions -> ProjectWorkspaceEntryPoint(
        ProjectWorkspaceSection.Github,
        ProjectGithubSection.Actions,
    )
}
