package com.poracode.app.ui.home

import java.security.SecureRandom

/**
 * Random worktree branch names (`poracode/<adjective>-<noun>-<8hex>`),
 * mirroring the shared renderer/supervisor generator so branches minted on
 * Android follow the same scheme.
 */
internal fun generateWorktreeBranch(): String {
    val random = SecureRandom()
    val adjective = WORKTREE_BRANCH_ADJECTIVES[random.nextInt(WORKTREE_BRANCH_ADJECTIVES.size)]
    val noun = WORKTREE_BRANCH_NOUNS[random.nextInt(WORKTREE_BRANCH_NOUNS.size)]
    val bytes = ByteArray(4).also(random::nextBytes)
    val hash = bytes.joinToString("") { "%02x".format(it) }
    return "poracode/$adjective-$noun-$hash"
}

private val WORKTREE_BRANCH_ADJECTIVES = listOf(
    "awesome", "brave", "calm", "daring", "eager", "fair", "gentle", "happy",
    "keen", "lively", "merry", "noble", "polite", "quiet", "royal", "sharp",
    "swift", "tender", "vivid", "warm", "bold", "clear", "fresh", "grand",
    "bright", "clever", "cosmic", "crisp", "golden", "honest", "nimble",
    "quick", "silver", "steady", "sunny", "tidy",
)

private val WORKTREE_BRANCH_NOUNS = listOf(
    "albatross", "badger", "condor", "dolphin", "eagle", "falcon", "gazelle",
    "heron", "ibis", "jaguar", "kestrel", "lemur", "marten", "newt", "otter",
    "puma", "quail", "raven", "stork", "tern", "viper", "wren", "yak", "zebra",
    "beacon", "comet", "ember", "harbor", "lantern", "meteor", "meadow",
    "pixel", "summit", "willow",
)
