package com.poracode.app.storage

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.UUID

/**
 * Crash-durable atomic file replacement.
 *
 * Contract:
 * 1. Unique sibling temp in the same directory
 * 2. Complete write + file descriptor sync
 * 3. Atomic move with ATOMIC_MOVE | REPLACE_EXISTING
 * 4. Only [AtomicMoveNotSupportedException] may fall back to same-dir
 *    move with REPLACE_EXISTING (still never direct overwrite)
 * 5. Directory fsync — failure policy is explicit via [DirectoryFsyncPolicy]
 *
 * Never writes the target path in place.
 *
 * Credential commits use [stageWrite] + [finalizeStaged] so encryption/temp
 * work stays outside the generation critical section; only the short final
 * replace/fsync serializes with [beginDurableOperation] receipt.
 */
interface AtomicFileWriter {
    fun writeAtomically(target: File, contents: ByteArray)

    fun writeAtomically(target: File, contents: String) {
        writeAtomically(target, contents.toByteArray(Charsets.UTF_8))
    }

    /** Write+fsync a unique sibling temp; does not touch [target]. */
    fun stageWrite(target: File, contents: ByteArray): StagedAtomicWrite

    fun stageWrite(target: File, contents: String): StagedAtomicWrite =
        stageWrite(target, contents.toByteArray(Charsets.UTF_8))

    /** Atomic rename of staged temp onto target + directory fsync. */
    fun finalizeStaged(staged: StagedAtomicWrite)

    /** Best-effort delete of an abandoned staged temp. */
    fun abandonStaged(staged: StagedAtomicWrite) {
        runCatching { if (staged.temp.exists()) staged.temp.delete() }
    }
}

/** Result of [AtomicFileWriter.stageWrite] — temp bytes ready for final replace. */
data class StagedAtomicWrite(
    val temp: File,
    val target: File,
)

/** How directory fsync failures are treated after a successful rename. */
enum class DirectoryFsyncPolicy {
    /** Log/swallow (default production on JVM unit tests without Os). */
    BestEffort,

    /** Propagate failure after rename (strict crash-durability tests). */
    Fail,
}

/** Injectable filesystem primitives so tests exercise the production algorithm. */
interface AtomicFileSyscalls {
    fun writeAndFsync(temp: File, contents: ByteArray)
    fun atomicMove(source: Path, target: Path)
    fun replaceMove(source: Path, target: Path)
    fun fsyncDirectory(directory: File)
}

object DefaultAtomicFileSyscalls : AtomicFileSyscalls {
    override fun writeAndFsync(temp: File, contents: ByteArray) {
        FileOutputStream(temp).use { fos ->
            fos.write(contents)
            fos.flush()
            fos.fd.sync()
        }
    }

    override fun atomicMove(source: Path, target: Path) {
        Files.move(
            source,
            target,
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING,
        )
    }

    override fun replaceMove(source: Path, target: Path) {
        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING)
    }

    override fun fsyncDirectory(directory: File) {
        try {
            val osClass = Class.forName("android.system.Os")
            val open = osClass.getMethod(
                "open",
                String::class.java,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType,
            )
            val fsync = osClass.getMethod("fsync", Class.forName("java.io.FileDescriptor"))
            val close = osClass.getMethod("close", Class.forName("java.io.FileDescriptor"))
            val oDirectory = Class.forName("android.system.OsConstants")
                .getField("O_RDONLY")
                .getInt(null)
            val fd = open.invoke(null, directory.absolutePath, oDirectory, 0)
            try {
                fsync.invoke(null, fd)
            } finally {
                runCatching { close.invoke(null, fd) }
            }
        } catch (e: Throwable) {
            // JVM unit tests and devices without Os open on directories.
            throw e
        }
    }
}

/**
 * Production atomic writer. Tests inject [syscalls] / [directoryFsyncPolicy]
 * rather than a divergent renameTo catch-all implementation.
 */
class ProductionAtomicFileWriterEngine(
    private val syscalls: AtomicFileSyscalls = DefaultAtomicFileSyscalls,
    private val directoryFsyncPolicy: DirectoryFsyncPolicy = DirectoryFsyncPolicy.BestEffort,
) : AtomicFileWriter {
    override fun writeAtomically(target: File, contents: ByteArray) {
        val staged = stageWrite(target, contents)
        try {
            finalizeStaged(staged)
        } catch (e: Exception) {
            abandonStaged(staged)
            throw e
        }
    }

    override fun stageWrite(target: File, contents: ByteArray): StagedAtomicWrite {
        val parent = target.parentFile
            ?: throw IOException("Missing parent for $target")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Unable to create ${parent.absolutePath}")
        }
        val temp = File(parent, "${target.name}.${UUID.randomUUID()}.tmp")
        try {
            syscalls.writeAndFsync(temp, contents)
            return StagedAtomicWrite(temp = temp, target = target)
        } catch (e: Exception) {
            runCatching { if (temp.exists()) temp.delete() }
            throw e
        }
    }

    override fun finalizeStaged(staged: StagedAtomicWrite) {
        val parent = staged.target.parentFile
            ?: throw IOException("Missing parent for ${staged.target}")
        try {
            try {
                syscalls.atomicMove(staged.temp.toPath(), staged.target.toPath())
            } catch (_: AtomicMoveNotSupportedException) {
                syscalls.replaceMove(staged.temp.toPath(), staged.target.toPath())
            }
            try {
                syscalls.fsyncDirectory(parent)
            } catch (e: Throwable) {
                when (directoryFsyncPolicy) {
                    DirectoryFsyncPolicy.BestEffort -> Unit
                    DirectoryFsyncPolicy.Fail -> throw IOException("directory fsync failed", e)
                }
            }
        } catch (e: Exception) {
            runCatching { if (staged.temp.exists()) staged.temp.delete() }
            throw e
        }
    }
}

object ProductionAtomicFileWriter : AtomicFileWriter by ProductionAtomicFileWriterEngine() {
    fun fsyncDirectory(directory: File) {
        try {
            DefaultAtomicFileSyscalls.fsyncDirectory(directory)
        } catch (_: Throwable) {
            // Best-effort companion helper for explicit deletes.
        }
    }
}

/**
 * Test-injectable writer that runs the **production** algorithm with staged
 * fault injection via [AtomicFileSyscalls] — not a divergent renameTo path.
 */
class ControllableAtomicFileWriter(
    private val directoryFsyncPolicy: DirectoryFsyncPolicy = DirectoryFsyncPolicy.BestEffort,
) : AtomicFileWriter {
    enum class Stage {
        /** Before any temp is created. */
        BeforeMutation,
        /** After temp bytes are written (and notionally fsynced), before rename. */
        AfterTempFsync,
        /** Immediately before final replace (generation check window). */
        BeforeFinalReplace,
        /** After rename replaced the target, before directory fsync. */
        AfterRename,
        /** After directory fsync. */
        AfterDirectoryFsync,
    }

    @Volatile
    var failAt: Stage? = null

    @Volatile
    var holdAt: Stage? = null

    @Volatile
    var stageReached: kotlinx.coroutines.CompletableDeferred<Stage>? = null

    @Volatile
    var stageHold: kotlinx.coroutines.CompletableDeferred<Unit>? = null

    /** Observed stages for assertions (append-only). */
    val observedStages = mutableListOf<Stage>()

    private val engine = ProductionAtomicFileWriterEngine(
        syscalls = object : AtomicFileSyscalls {
            override fun writeAndFsync(temp: File, contents: ByteArray) {
                hit(Stage.BeforeMutation)
                DefaultAtomicFileSyscalls.writeAndFsync(temp, contents)
                hit(Stage.AfterTempFsync)
            }

            override fun atomicMove(source: Path, target: Path) {
                hit(Stage.BeforeFinalReplace)
                DefaultAtomicFileSyscalls.atomicMove(source, target)
                hit(Stage.AfterRename)
            }

            override fun replaceMove(source: Path, target: Path) {
                hit(Stage.BeforeFinalReplace)
                DefaultAtomicFileSyscalls.replaceMove(source, target)
                hit(Stage.AfterRename)
            }

            override fun fsyncDirectory(directory: File) {
                try {
                    DefaultAtomicFileSyscalls.fsyncDirectory(directory)
                } catch (_: Throwable) {
                    // JVM: directory fsync unavailable — still mark stage.
                }
                hit(Stage.AfterDirectoryFsync)
            }
        },
        directoryFsyncPolicy = directoryFsyncPolicy,
    )

    override fun writeAtomically(target: File, contents: ByteArray) {
        engine.writeAtomically(target, contents)
    }

    override fun stageWrite(target: File, contents: ByteArray): StagedAtomicWrite =
        engine.stageWrite(target, contents)

    override fun finalizeStaged(staged: StagedAtomicWrite) {
        engine.finalizeStaged(staged)
    }

    private fun hit(stage: Stage) {
        observedStages += stage
        if (failAt == stage) {
            failAt = null
            throw IOException("injected fault at $stage")
        }
        if (holdAt == stage) {
            val reached = stageReached
            val hold = stageHold
            reached?.complete(stage)
            if (hold != null) {
                val latch = java.util.concurrent.CountDownLatch(1)
                hold.invokeOnCompletion { latch.countDown() }
                if (!hold.isCompleted) {
                    latch.await()
                }
            }
            holdAt = null
        }
    }
}
