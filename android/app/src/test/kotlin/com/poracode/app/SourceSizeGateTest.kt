package com.poracode.app

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Hard gate: every production Kotlin source under app/src/main must be <500 lines.
 * Prevents RemoteWebSocketClient-style god files from returning.
 */
class SourceSizeGateTest {
    @Test
    fun everyProductionKotlinFileUnder500Lines() {
        val roots = listOf(
            File("src/main/kotlin"),
            File("app/src/main/kotlin"),
        )
        val main = roots.firstOrNull { it.isDirectory }
            ?: error("Cannot locate src/main/kotlin from ${File(".").absolutePath}")
        val offenders = mutableListOf<String>()
        main.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .forEach { file ->
                val lines = file.readLines().size
                if (lines >= 500) {
                    offenders += "${file.relativeTo(main)}:$lines"
                }
            }
        assertTrue(
            "Production files must stay below 500 lines:\n${offenders.joinToString("\n")}",
            offenders.isEmpty(),
        )
    }
}
