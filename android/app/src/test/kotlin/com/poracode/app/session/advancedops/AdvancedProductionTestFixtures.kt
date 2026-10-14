package com.poracode.app.session.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.transport.RemoteWebSocketClient

internal val ADVANCED_CONNECTION_A =
    ClientConnectionId("a0000000-0000-4000-8000-000000000001")
internal val ADVANCED_CONNECTION_B =
    ClientConnectionId("b0000000-0000-4000-8000-000000000002")

internal fun advancedProfile(
    desktopId: String = "desktop-a",
    endpoint: String = "https://a.example.test",
) = ConnectionProfile(
    desktopId = desktopId,
    label = desktopId,
    httpBaseUrl = endpoint,
    wsBaseUrl = endpoint.replace("https", "wss"),
    appVersion = "1.5.0",
    scopes = listOf("session:read", "session:operate", "projects:manage"),
    pairedAtEpochMs = if (desktopId == "desktop-a") 10 else 20,
)

internal fun advancedState(
    connectionId: ClientConnectionId = ADVANCED_CONNECTION_A,
    profile: ConnectionProfile = advancedProfile(),
    projectPath: String = "/workspace/one",
    projectId: String = "project-one",
    threadId: String = "thread-one",
) = AppSession.UiState(
    phase = AppSession.Phase.Ready,
    profile = profile,
    socketState = RemoteWebSocketClient.ConnectionState.Online,
    snapshot = RemoteShellSnapshot(
        snapshotSeq = 12,
        projects = listOf(
            RemoteProject(
                id = projectId,
                name = "One",
                location = PosixProjectLocation(projectPath),
                createdAt = "2026-08-12T00:00:00.000Z",
            ),
            RemoteProject(
                id = "project-two",
                name = "Two",
                location = PosixProjectLocation("/workspace/two"),
                createdAt = "2026-08-12T00:00:00.000Z",
            ),
        ),
        threads = listOf(
            RemoteThread(
                id = threadId,
                projectId = projectId,
                title = "Thread",
                agentKind = "codex",
                status = "idle",
                attention = "none",
                createdAt = "2026-08-12T00:00:00.000Z",
                updatedAt = "2026-08-12T00:00:00.000Z",
            ),
        ),
        updatedAt = "2026-08-12T00:00:00.000Z",
    ),
    openThreadId = threadId,
    canSessionRead = true,
    canSessionOperate = true,
    hostCatalog = HostUiCatalog(
        hosts = listOf(HostRecord(connectionId, profile)),
        selectedConnectionId = connectionId,
        lru = listOf(connectionId),
    ),
)
