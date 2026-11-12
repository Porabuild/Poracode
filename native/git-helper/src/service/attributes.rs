//! Refuse unsupported content conversion without resolving attributes per file
//! when none of the attribute sources can define either conversion attribute.

use git2::{
    AttrCheckFlags, AttrValue, Config, ConfigLevel, Error, ErrorClass, ErrorCode, Index, Repository,
};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

const CONTENT_ATTRIBUTES: [&str; 2] = ["filter", "working-tree-encoding"];

fn unsupported(message: &str) -> Error {
    Error::new(ErrorCode::Invalid, ErrorClass::Config, message)
}

pub(super) fn check(repo: &Repository, config: &Config, index: &Index) -> Result<(), Error> {
    if std::env::var_os("GIT_ATTR_SOURCE").is_some() {
        return Err(unsupported(
            "Alternate Git attribute sources require fallback",
        ));
    }
    let mut flags = AttrCheckFlags::FILE_THEN_INDEX;
    if let Some(value) = std::env::var_os("GIT_ATTR_NOSYSTEM")
        && Config::parse_bool(
            value
                .to_str()
                .ok_or_else(|| unsupported("Invalid Git attribute environment"))?,
        )?
    {
        flags |= AttrCheckFlags::NO_SYSTEM;
    }
    if let Some(sources) = shared_sources(repo, config)?
        && !may_define_content_attributes(repo, index, sources)?
    {
        return Ok(());
    }
    // Raw content/stat equality can hide changes after a filter configuration
    // edit. When relevant rules exist, retain checks of every tracked file.
    for entry in index.iter() {
        if entry.mode & 0o170000 != 0o100000 {
            continue;
        }
        let path = std::str::from_utf8(&entry.path)
            .map_err(|_| unsupported("Non-UTF-8 attribute paths require fallback"))?;
        for attribute in CONTENT_ATTRIBUTES {
            let value = repo
                .get_attr_bytes(Path::new(path), attribute, flags)
                .map_err(|_| unsupported("Git attributes require fallback"))?;
            if matches!(
                AttrValue::from_bytes(value),
                AttrValue::String(_) | AttrValue::Bytes(_)
            ) {
                return Err(unsupported(
                    "Git content filters or working-tree encoding require fallback",
                ));
            }
        }
    }
    Ok(())
}

fn shared_sources(repo: &Repository, config: &Config) -> Result<Option<Vec<PathBuf>>, Error> {
    let mut sources = vec![
        repo.commondir().join("info/attributes"),
        repo.path().join("info/attributes"),
    ];
    let mut levels = Vec::new();
    match config.get_path("core.attributesfile") {
        Ok(path) if path.is_absolute() => sources.push(path),
        Ok(_) => return Ok(None),
        Err(error) if error.code() == ErrorCode::NotFound => {
            levels.push((ConfigLevel::XDG, "attributes"))
        }
        Err(error) => return Err(error),
    }
    // libgit2 preloads system attribute macros even with NO_SYSTEM set.
    levels.push((ConfigLevel::System, "gitattributes"));
    for (level, name) in levels {
        // Repository opening initialized libgit2. This helper never changes its
        // global search paths; GET_SEARCH_PATH only copies those initialized paths.
        let paths = unsafe { git2::opts::get_search_path(level) }?;
        let Some(paths) = paths.to_str().ok() else {
            return Ok(None);
        };
        for directory in std::env::split_paths(paths) {
            if !directory.is_absolute() {
                return Ok(None);
            }
            sources.push(directory.join(name));
        }
    }
    Ok(Some(sources))
}

fn contains_content_attribute(bytes: &[u8]) -> bool {
    CONTENT_ATTRIBUTES.iter().any(|name| {
        bytes
            .windows(name.len())
            .any(|part| part == name.as_bytes())
    })
}

fn may_define_content_attributes(
    repo: &Repository,
    index: &Index,
    sources: Vec<PathBuf>,
) -> Result<bool, Error> {
    let Some(workdir) = repo.workdir() else {
        return Ok(true);
    };
    let mut sources: HashSet<PathBuf> = sources.into_iter().collect();
    let mut directories = HashSet::new();
    for entry in index.iter() {
        if entry.mode & 0o170000 != 0o100000 {
            continue;
        }
        let path = Path::new(
            std::str::from_utf8(&entry.path)
                .map_err(|_| unsupported("Non-UTF-8 attribute paths require fallback"))?,
        );
        if path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Ok(true);
        }
        let mut directory = path.parent();
        while let Some(parent) = directory {
            if !directories.insert(parent.to_path_buf()) {
                break;
            }
            sources.insert(workdir.join(parent).join(".gitattributes"));
            directory = parent.parent();
        }
        // Include staged attributes even when the worktree copy differs or is
        // absent. Extra matches only select the existing exact libgit2 check.
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(".gitattributes"))
        {
            match repo.find_blob(entry.id) {
                Ok(blob) if !contains_content_attribute(blob.content()) => {}
                _ => return Ok(true),
            }
        }
    }
    for source in sources {
        match fs::read(source) {
            Ok(bytes) if !contains_content_attribute(&bytes) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => return Ok(true),
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    struct Fixture(PathBuf);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn detects_worktree_index_macro_and_shared_rules_without_scanning_ordinary_files() {
        let fixture = Fixture(std::env::temp_dir().join(format!(
            "poracode-attributes-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        )));
        fs::create_dir_all(fixture.0.join("nested")).unwrap();
        let repo = Repository::init(&fixture.0).unwrap();
        repo.config()
            .unwrap()
            .set_bool("core.ignorecase", true)
            .unwrap();
        fs::write(fixture.0.join("nested/file.txt"), "content\n").unwrap();
        fs::write(fixture.0.join(".gitattributes"), "*.txt text eol=lf\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("nested/file.txt")).unwrap();
        index.add_path(Path::new(".gitattributes")).unwrap();
        index.write().unwrap();
        assert!(!may_define_content_attributes(&repo, &index, vec![]).unwrap());

        fs::write(
            fixture.0.join("nested/.gitattributes"),
            "*.txt working-tree-encoding=UTF-16LE\n",
        )
        .unwrap();
        assert!(may_define_content_attributes(&repo, &index, vec![]).unwrap());
        fs::remove_file(fixture.0.join("nested/.gitattributes")).unwrap();
        fs::write(
            fixture.0.join(".gitattributes"),
            "[attr]converted filter=normalize\n*.txt converted\n",
        )
        .unwrap();
        assert!(may_define_content_attributes(&repo, &index, vec![]).unwrap());
        index.add_path(Path::new(".gitattributes")).unwrap();
        index.write().unwrap();
        fs::remove_file(fixture.0.join(".gitattributes")).unwrap();
        assert!(may_define_content_attributes(&repo, &index, vec![]).unwrap());

        index.remove_path(Path::new(".gitattributes")).unwrap();
        index.write().unwrap();
        assert!(!may_define_content_attributes(&repo, &index, vec![]).unwrap());
        fs::write(fixture.0.join(".GITATTRIBUTES"), "*.txt filter=normalize\n").unwrap();
        index.add_path(Path::new(".GITATTRIBUTES")).unwrap();
        index.write().unwrap();
        fs::remove_file(fixture.0.join(".GITATTRIBUTES")).unwrap();
        assert!(may_define_content_attributes(&repo, &index, vec![]).unwrap());
        assert!(check(&repo, &repo.config().unwrap(), &index).is_err());
        index.remove_path(Path::new(".GITATTRIBUTES")).unwrap();
        index.write().unwrap();
        let shared = fixture.0.join("shared-attributes");
        fs::write(&shared, "*.txt filter=normalize\n").unwrap();
        assert!(may_define_content_attributes(&repo, &index, vec![shared]).unwrap());
    }
}
