package com.poracode.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectValidationTest {
    @Test
    fun projectNameUsesJsWhitespaceAndUtf16Length() {
        assertNull(projectNameProblem("\uFEFF\u00A0valid name\u3000"))
        assertEquals(ProjectNameProblem.EMPTY, projectNameProblem("\uFEFF\u202F\u3000"))
        assertEquals(ProjectNameProblem.RESERVED, projectNameProblem("\uFEFF..\u00A0"))
        assertNull(projectNameProblem("a".repeat(253) + "😀"))
        assertEquals(ProjectNameProblem.TOO_LONG, projectNameProblem("a".repeat(254) + "😀"))
    }

    @Test
    fun projectNameRejectsEveryPortableIllegalCharacter() {
        for (character in listOf('/', '\\', ':', '*', '?', '"', '<', '>', '|')) {
            assertEquals(
                "character $character",
                ProjectNameProblem.ILLEGAL_CHARACTER,
                projectNameProblem("bad${character}name"),
            )
        }
        assertTrue(isValidProjectName("東京 project"))
    }

    @Test
    fun cloneUrlAllowsOnlyAuthoritativeNetworkAndScpTransports() {
        for (url in listOf(
            "https://example.test/owner/repo.git",
            "http://example.test/repo",
            "ssh://git@example.test/owner/repo.git",
            "git://example.test/owner/repo.git",
            "ftp://example.test/repo.git",
            "ftps://example.test/repo.git",
            "git@example.test:owner/repo.git",
            "\uFEFF https://example.test/项目.git \u3000",
        )) {
            assertNull(url, cloneUrlProblem(url))
        }
    }

    @Test
    fun cloneUrlRejectsInjectionLocalAndUnknownTransports() {
        val invalid = mapOf(
            "" to CloneUrlProblem.EMPTY,
            " --upload-pack=touch" to CloneUrlProblem.LEADING_DASH,
            "ext::sh -c whoami" to CloneUrlProblem.REMOTE_HELPER,
            "helper::payload" to CloneUrlProblem.REMOTE_HELPER,
            "::payload" to CloneUrlProblem.REMOTE_HELPER,
            "file:///etc/passwd" to CloneUrlProblem.DISALLOWED_SCHEME,
            "file:/etc/passwd" to CloneUrlProblem.DISALLOWED_SCHEME,
            "gopher://example.test/repo" to CloneUrlProblem.DISALLOWED_SCHEME,
            "/srv/repo" to CloneUrlProblem.INVALID_SYNTAX,
            "example.test:owner/repo" to CloneUrlProblem.DISALLOWED_SCHEME,
        )
        for ((url, expected) in invalid) {
            assertEquals(url, expected, cloneUrlProblem(url))
        }
    }
}
