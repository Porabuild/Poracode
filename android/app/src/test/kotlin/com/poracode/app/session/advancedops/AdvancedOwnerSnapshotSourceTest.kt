package com.poracode.app.session.advancedops

import com.poracode.app.model.PosixProjectLocation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancedOwnerSnapshotSourceTest {
    @Test
    fun `snapshot carries exact selected host and monotonic owner generations`() {
        val initial = advancedState()
        val source = AdvancedOwnerSnapshotSource(initial, foreground = true)
        val first = source.state.value

        assertEquals(ADVANCED_CONNECTION_A, first.host?.clientConnectionId)
        assertEquals("desktop-a", first.host?.desktopId)
        assertEquals(initial.profile?.scopes?.toSet(), first.host?.scopes)
        assertTrue(first.host?.online == true && first.host.ready && first.foreground)
        assertEquals("thread-one", first.thread?.threadId)
        assertEquals("project-one", first.project?.projectId)
        assertEquals(PosixProjectLocation("/workspace/one"), first.location?.location)

        source.selectProject("project-two")
        val projectChanged = source.state.value
        assertTrue(projectChanged.project!!.projectGeneration > first.project!!.projectGeneration)
        assertTrue(projectChanged.location!!.locationGeneration > first.location!!.locationGeneration)
        assertEquals(first.thread!!.threadGeneration, projectChanged.thread!!.threadGeneration)
        assertFalse(projectChanged.isCurrent(first.project!!))

        val moved = initial.copy(
            snapshot = initial.snapshot!!.copy(
                projects = initial.snapshot.projects.map {
                    if (it.id == "project-two") {
                        it.copy(location = PosixProjectLocation("/workspace/two-moved"))
                    } else {
                        it
                    }
                },
            ),
        )
        source.update(moved)
        val locationChanged = source.state.value
        assertTrue(
            locationChanged.location!!.locationGeneration > projectChanged.location!!.locationGeneration,
        )

        source.update(moved.copy(openThreadId = null))
        val threadClosed = source.state.value
        assertEquals(null, threadClosed.thread)
        assertFalse(threadClosed.isCurrent(first.thread!!))

        val beforeBackground = threadClosed.host!!.desktopHostGeneration
        source.setForeground(false)
        val background = source.state.value
        assertFalse(background.foreground)
        assertTrue(background.host!!.desktopHostGeneration > beforeBackground)
        source.setForeground(true)
        assertTrue(source.state.value.host!!.desktopHostGeneration > background.host!!.desktopHostGeneration)

        val profileB = advancedProfile("desktop-b", "https://b.example.test")
        source.update(advancedState(ADVANCED_CONNECTION_B, profileB))
        val hostChanged = source.state.value
        assertEquals(ADVANCED_CONNECTION_B, hostChanged.host?.clientConnectionId)
        assertEquals("desktop-b", hostChanged.host?.desktopId)
        assertNotEquals(first.host?.key, hostChanged.host?.key)
        assertFalse(hostChanged.isCurrent(first.thread!!))
    }
}
