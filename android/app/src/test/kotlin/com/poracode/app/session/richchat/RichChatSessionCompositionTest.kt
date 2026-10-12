package com.poracode.app.session.richchat

import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.session.AppSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RichChatSessionCompositionTest {
    @Test
    fun selectionFollowsOnlyExactGuiThreadAndPrefersLoadedDetailMode() {
        val gui = thread("thread-a", "gui")
        val shell = RemoteShellSnapshot(1, threads = listOf(gui), updatedAt = "now")

        assertEquals(
            "thread-a",
            desiredRichChatThreadId(AppSession.UiState(openThreadId = "thread-a", snapshot = shell)),
        )
        assertNull(
            desiredRichChatThreadId(
                AppSession.UiState(
                    openThreadId = "thread-a",
                    snapshot = shell,
                    threadSnapshot = RemoteThreadSnapshot(
                        snapshotSeq = 2,
                        thread = gui.copy(presentationMode = "terminal"),
                        updatedAt = "now",
                    ),
                ),
            ),
        )
        assertEquals(
            "thread-a",
            desiredTerminalThreadId(
                AppSession.UiState(
                    openThreadId = "thread-a",
                    snapshot = shell,
                    threadSnapshot = RemoteThreadSnapshot(
                        snapshotSeq = 2,
                        thread = gui.copy(presentationMode = "terminal"),
                        updatedAt = "now",
                    ),
                ),
            ),
        )
        assertNull(
            desiredTerminalThreadId(
                AppSession.UiState(openThreadId = "thread-a", snapshot = shell),
            ),
        )
        assertEquals(
            "legacy-gui",
            desiredRichChatThreadId(AppSession.UiState(openThreadId = "legacy-gui")),
        )
        assertNull(desiredRichChatThreadId(AppSession.UiState()))
    }

    private fun thread(id: String, mode: String) = RemoteThread(
        id = id,
        projectId = "project-a",
        title = "Thread",
        agentKind = "codex",
        status = "idle",
        attention = "none",
        presentationMode = mode,
        createdAt = "now",
        updatedAt = "now",
    )
}
