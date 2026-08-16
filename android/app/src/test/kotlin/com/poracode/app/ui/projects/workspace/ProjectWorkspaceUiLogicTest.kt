package com.poracode.app.ui.projects.workspace

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.GitFileChange
import com.poracode.app.model.ProjectFileReadResult
import com.poracode.app.model.ProjectFileReadStatus
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.session.projects.ProjectOperationFailure
import com.poracode.app.session.projects.ProjectWorkspaceEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectWorkspaceUiLogicTest {
    @Test
    fun accessRequiresExactOnlineReadyHostAndIndividualScopes() {
        val identity = ProjectIdentity(HOST_A, "project")
        val lease = ProjectHostLease(
            HOST_A,
            4,
            setOf("session:read"),
            online = true,
            ready = true,
        )

        assertEquals(
            ProjectWorkspaceAccess(true, true, true, true, false),
            ProjectWorkspaceAccess.from(lease, identity),
        )
        assertFalse(ProjectWorkspaceAccess.from(lease.copy(connectionId = HOST_B), identity).exactHost)
        assertFalse(ProjectWorkspaceAccess.from(lease.copy(online = false), identity).canRead)
        assertFalse(ProjectWorkspaceAccess.from(lease.copy(ready = false), identity).canRead)
        assertTrue(
            ProjectWorkspaceAccess.from(
                lease.copy(scopes = lease.scopes + "session:operate"),
                identity,
            ).canWrite,
        )
    }

    @Test
    fun busyGatesAreChannelSpecificAndSaveRequiresDirtyReadyText() {
        val access = ProjectWorkspaceAccess(true, true, true, true, true)
        val ready = file(ProjectFileReadStatus.Ready, "old")
        val actions = projectWorkspaceActions(
            access,
            ProjectWorkspaceEntry(
                openFile = ready,
                loadingTree = true,
                loadingFile = false,
                loadingGit = true,
            ),
            dirty = true,
            diffLoading = false,
        )

        assertFalse(actions.canBrowse)
        assertTrue(actions.canSearch)
        assertTrue(actions.canOpenFile)
        assertTrue(actions.canSaveFile)
        assertFalse(actions.canRefreshGit)
        assertFalse(actions.canLoadDiff)
        assertFalse(
            projectWorkspaceActions(
                access,
                ProjectWorkspaceEntry(openFile = file(ProjectFileReadStatus.Binary, null)),
                dirty = true,
                diffLoading = false,
            ).canSaveFile,
        )
    }

    @Test
    fun filePresentationAndDirtyStateNeverTreatBinaryAsEditable() {
        assertEquals(ProjectFilePresentation.Empty, null.presentation())
        assertEquals(
            ProjectFilePresentation.TooLarge,
            file(ProjectFileReadStatus.TooLarge, null).presentation(),
        )
        assertTrue(isProjectFileDirty(file(ProjectFileReadStatus.Ready, "old"), "new"))
        assertFalse(isProjectFileDirty(file(ProjectFileReadStatus.Binary, null), "new"))
    }

    @Test
    fun relativeParentPathsRetainUnicodeAndStopAtProjectRoot() {
        assertEquals("", projectParentPath(""))
        assertEquals("", projectParentPath("src"))
        assertEquals("src/组件", projectParentPath("src/组件/Button.kt/"))
    }

    @Test
    fun gitStatusesAndDiffLinesAreNormalizedForPresentation() {
        assertEquals(GitChangeKind.Renamed, change("R").kind())
        assertEquals(GitChangeKind.Untracked, change("??").kind())
        assertEquals(GitChangeKind.Changed, change("provider-native-value").kind())

        val parsed = parseGitDiff("--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n context")
        assertEquals(
            listOf(
                GitDiffLineKind.Header,
                GitDiffLineKind.Header,
                GitDiffLineKind.Header,
                GitDiffLineKind.Deletion,
                GitDiffLineKind.Addition,
                GitDiffLineKind.Context,
            ),
            parsed.lines.map { it.kind },
        )
        assertFalse(parsed.truncated)
        assertTrue(parseGitDiff("one\ntwo\nthree", limit = 2).truncated)
    }

    @Test
    fun ambiguousWriteFailureIsKeptDistinctForSafeRecoveryCopy() {
        assertTrue(ProjectOperationFailure.Remote(503, "network", true).isAmbiguousSaveFailure())
        assertFalse(ProjectOperationFailure.Remote(409, "request_failed", false).isAmbiguousSaveFailure())
        assertFalse(ProjectOperationFailure.Offline.isAmbiguousSaveFailure())
    }

    private fun file(status: ProjectFileReadStatus, content: String?) = ProjectFileReadResult(
        path = "README.md",
        status = status,
        modifiedAtMs = 1.25,
        content = content,
    )

    private fun change(status: String) = GitFileChange(
        path = "src/file.kt",
        status = status,
        staged = false,
        insertions = 1,
        deletions = 1,
    )

    companion object {
        private val HOST_A = ClientConnectionId("11111111-1111-4111-8111-111111111111")
        private val HOST_B = ClientConnectionId("22222222-2222-4222-8222-222222222222")
    }
}
