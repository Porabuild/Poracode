# gix-hash 0.28.1

Source: the [crates.io release](https://crates.io/crates/gix-hash/0.28.1),
including both upstream licenses. This copy backports only the `gix-hash`
portion of [gitoxide's faster-hex 1.0 upgrade](https://github.com/GitoxideLabs/gitoxide/commit/945b52aa300665c69f0be80f8ae941505f2128b3):
the manifest and the object ID and prefix decoders. With the existing features,
faster-hex 1.0 does not pull in the affected heapless 0.8 dependency.

Remove this copy and the Cargo patch when the published gitoxide stack used
by `git-helper` includes the upgrade.
