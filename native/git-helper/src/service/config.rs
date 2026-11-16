//! Resolve hasconfig includes without Git processes or configuration writes.
//! gix-config supplies parsing, but its include resolver intentionally differs
//! from Git in directive ordering and forbidden remote URLs (see its docs).

use git2::{Binding, Config, ConfigLevel, Error, ErrorClass, ErrorCode, Repository};
use gix_config::{
    AsBStr,
    parse::{EventRef, Events},
};
use gix_glob::wildmatch::Mode;
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::{CStr, c_char, c_int, c_void};
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};

#[derive(Clone)]
struct Entry {
    section: String,
    subsection: Option<String>,
    key: String,
    value: Option<String>,
}

struct Resolver<'a> {
    repo: &'a Repository,
    urls: Vec<String>,
    home: Option<PathBuf>,
}

pub(super) fn resolved(repo: &Repository) -> Result<Config, Error> {
    resolve(repo, false).map(|(config, _)| config)
}

pub(super) fn resolved_for_watch(repo: &Repository) -> Result<(Config, u64), Error> {
    resolve(repo, true)
}

fn resolve(repo: &Repository, fingerprint: bool) -> Result<(Config, u64), Error> {
    let config = repo.config()?;
    let mut entries = config.entries(None)?;
    let mut roots = BTreeSet::new();
    let mut has_hasconfig = false;
    let replace_global = std::env::var_os("GIT_CONFIG_GLOBAL").is_some();
    let mut ignored_xdg = false;
    while let Some(entry) = entries.next() {
        let entry = entry?;
        // Git's explicit global path replaces both ~/.gitconfig and XDG.
        // libgit2 still loads the XDG backend alongside that override.
        if replace_global && entry.level() == ConfigLevel::XDG {
            ignored_xdg = true;
            continue;
        }
        has_hasconfig |= entry
            .name()?
            .starts_with("includeif.hasconfig:remote.*.url:");
        let name = entry.name()?;
        if (name == "include.path" || (name.starts_with("includeif.") && name.ends_with(".path")))
            && entry.has_value()
            && entry.value_bytes().starts_with(b"%(prefix)/")
        {
            return Err(config_error());
        }
        if entry.include_depth() == 0 {
            // SAFETY: ConfigEntry owns a live libgit2 entry for this iteration;
            // origin_path is either null or its NUL-terminated origin string.
            let origin = unsafe { (*entry.raw()).origin_path };
            if !origin.is_null() {
                let path = unsafe { CStr::from_ptr(origin) }
                    .to_str()
                    .map_err(|_| config_error())?;
                roots.insert((entry.level() as i32, PathBuf::from(path)));
            }
        }
    }
    drop(entries);
    if !has_hasconfig && !ignored_xdg && !fingerprint {
        return Ok((config, 0));
    }
    let mut resolver = Resolver {
        repo,
        urls: Vec::new(),
        home: std::env::var_os("HOME")
            .or_else(|| {
                if !cfg!(windows) {
                    return None;
                }
                let mut drive = std::env::var_os("HOMEDRIVE")?;
                drive.push(std::env::var_os("HOMEPATH")?);
                Some(drive)
            })
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from),
    };
    // Git scans ahead through every ordinary include before evaluating any
    // hasconfig condition, including URLs declared later in local/worktree files.
    for (_, path) in &roots {
        resolver.walk(path, 0, false, true, &mut Vec::new())?;
    }
    let mut output = String::new();
    for (_, path) in &roots {
        let mut values = Vec::new();
        resolver.walk(path, 0, false, false, &mut values)?;
        for entry in values {
            serialize(&entry, &mut output);
        }
    }
    let resolved = in_memory(output.as_bytes(), repo)?;
    // open_ext has already bound workdir, object format and worktree config.
    // set_config cannot rebind that layout, including layout inherited from an
    // XDG backend which Git's explicit global path should have excluded.
    if layout(&config)? != layout(&resolved)? {
        return Err(config_error());
    }
    repo.set_config(&resolved)?;
    let mut hash = DefaultHasher::new();
    if fingerprint {
        // These sources may live outside watched roots. A changed fingerprint
        // makes the next worktree notification reconcile Git before skipping.
        output.hash(&mut hash);
        let excludes = match resolved.get_path("core.excludesfile") {
            Ok(path) if path.is_absolute() => Some(path),
            Ok(_) => return Err(config_error()),
            Err(error) if error.code() == ErrorCode::NotFound => {
                std::env::var_os("XDG_CONFIG_HOME")
                    .map(PathBuf::from)
                    .or_else(|| resolver.home.as_ref().map(|home| home.join(".config")))
                    .map(|path| path.join("git/ignore"))
            }
            Err(error) => return Err(error),
        };
        if let Some(path) = excludes {
            let bytes = match fs::read(path) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(_) => return Err(config_error()),
            };
            bytes.hash(&mut hash);
        }
    }
    Ok((resolved, hash.finish()))
}

fn layout(config: &Config) -> Result<BTreeMap<String, Option<Vec<u8>>>, Error> {
    let mut values = BTreeMap::new();
    let mut entries = config.entries(None)?;
    while let Some(entry) = entries.next() {
        let entry = entry?;
        let name = entry.name()?;
        if matches!(
            name,
            "core.bare" | "core.worktree" | "core.repositoryformatversion"
        ) || name.starts_with("extensions.")
        {
            values.insert(
                name.to_owned(),
                entry.has_value().then(|| entry.value_bytes().to_vec()),
            );
        }
    }
    Ok(values)
}

impl Resolver<'_> {
    fn walk(
        &mut self,
        path: &Path,
        depth: usize,
        forbid_urls: bool,
        scan: bool,
        output: &mut Vec<Entry>,
    ) -> Result<(), Error> {
        if depth > 10 {
            return Err(config_error());
        }
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err(config_error()),
        };
        for entry in parse(&bytes)? {
            if entry.section == "remote" && entry.subsection.is_some() && entry.key == "url" {
                if forbid_urls {
                    return Err(config_error());
                }
                if scan {
                    self.urls.push(entry.value.clone().unwrap_or_default());
                }
            }
            let condition = if entry.section == "include"
                && entry.subsection.is_none()
                && entry.key == "path"
            {
                Some((true, false))
            } else if entry.section == "includeif" && entry.key == "path" {
                match entry.subsection.as_deref() {
                    Some(condition) => Some((
                        self.matches(condition, path, scan)?,
                        condition.starts_with("hasconfig:remote.*.url:"),
                    )),
                    None => None,
                }
            } else {
                None
            };
            if let Some((matches, hasconfig)) = condition {
                // Git's remote-URL lookahead also validates unmatched hasconfig
                // includes, without letting those files contribute remote URLs.
                if matches || (scan && hasconfig) {
                    let include =
                        self.include_path(entry.value.as_deref().ok_or_else(config_error)?, path)?;
                    self.walk(&include, depth + 1, forbid_urls || hasconfig, scan, output)?;
                }
            } else if !scan {
                output.push(entry);
            }
        }
        Ok(())
    }

    fn matches(&self, condition: &str, source: &Path, scan: bool) -> Result<bool, Error> {
        if let Some(pattern) = condition.strip_prefix("hasconfig:remote.*.url:") {
            return Ok(!scan && self.urls.iter().any(|url| matches(pattern, url, false)));
        }
        if let Some(pattern) = condition.strip_prefix("onbranch:") {
            let head = self.repo.find_reference("HEAD")?;
            let target = head.symbolic_target()?.unwrap_or("");
            let branch = target.strip_prefix("refs/heads/").unwrap_or("");
            let pattern = if pattern.ends_with('/') {
                format!("{pattern}**")
            } else {
                pattern.to_owned()
            };
            return Ok(!branch.is_empty() && matches(&pattern, branch, false));
        }
        let (pattern, ignore_case) = if let Some(pattern) = condition.strip_prefix("gitdir/i:") {
            (pattern, true)
        } else if let Some(pattern) = condition.strip_prefix("gitdir:") {
            (pattern, false)
        } else {
            return Ok(false);
        };
        // Git resolves the containing file and matches its directory literally;
        // aliases and wildcard characters there are not part of the glob.
        let literal_prefix = if pattern.starts_with("./") {
            let source = fs::canonicalize(source).map_err(|_| config_error())?;
            let parent = source.parent().ok_or_else(config_error)?;
            Some(format!(
                "{}/",
                git_path_string(parent).trim_end_matches('/')
            ))
        } else {
            None
        };
        let mut pattern = if literal_prefix.is_some() {
            pattern.strip_prefix("./").unwrap_or(pattern).to_owned()
        } else if pattern.starts_with('~') {
            git_path_string(&self.interpolate(pattern)?)
        } else {
            pattern.to_owned()
        };
        if literal_prefix.is_none() && !Path::new(&pattern).is_absolute() {
            pattern = format!("**/{pattern}");
        }
        if pattern.ends_with('/') || (literal_prefix.is_some() && pattern.is_empty()) {
            pattern.push_str("**");
        }
        let paths = [
            Some(self.repo.path().to_path_buf()),
            fs::canonicalize(self.repo.path()).ok(),
        ];
        Ok(paths.into_iter().flatten().any(|path| {
            let path = git_path_string(&path);
            let mut path = path.trim_end_matches('/');
            if let Some(prefix) = &literal_prefix {
                let Some(actual) = path.get(..prefix.len()) else {
                    return false;
                };
                if !(if ignore_case {
                    actual.eq_ignore_ascii_case(prefix)
                } else {
                    actual == prefix
                }) {
                    return false;
                }
                path = &path[prefix.len()..];
            }
            matches(&pattern, path, ignore_case)
        }))
    }

    fn interpolate(&self, value: &str) -> Result<PathBuf, Error> {
        // A system config path need not identify Git's installation prefix
        // (e.g. /etc/gitconfig versus /usr). Never guess for this rare syntax.
        if value.starts_with("%(prefix)/") {
            return Err(config_error());
        }
        let path = gix_config::Path::from(value.as_bstr())
            .interpolate(gix_config::path::interpolate::Context {
                home_dir: self.home.as_deref(),
                ..Default::default()
            })
            .map_err(|_| config_error())?;
        Ok(path)
    }

    fn include_path(&self, value: &str, source: &Path) -> Result<PathBuf, Error> {
        let path = self.interpolate(value)?;
        Ok(if path.is_absolute() {
            path
        } else {
            source.parent().unwrap_or(Path::new("")).join(path)
        })
    }
}

fn git_path_string(path: &Path) -> String {
    let path = path.to_string_lossy().replace('\\', "/");
    if let Some(unc) = path.strip_prefix("//?/UNC/") {
        format!("//{unc}")
    } else {
        path.strip_prefix("//?/").unwrap_or(&path).to_owned()
    }
}

fn matches(pattern: &str, value: &str, ignore_case: bool) -> bool {
    let mut mode = Mode::NO_MATCH_SLASH_LITERAL;
    if ignore_case {
        mode |= Mode::IGNORE_CASE;
    }
    gix_glob::wildmatch(pattern.as_bstr(), value.as_bstr(), mode)
}

fn parse(bytes: &[u8]) -> Result<Vec<Entry>, Error> {
    let events = Events::from_bytes(bytes, None).map_err(|_| config_error())?;
    let mut output = Vec::new();
    for section in events.sections() {
        let EventRef::SectionHeader {
            name,
            subsection_name,
            separator,
        } = section.header()
        else {
            continue;
        };
        let name = std::str::from_utf8(name.as_ref())
            .map_err(|_| config_error())?
            .to_ascii_lowercase();
        let subsection = subsection_name
            .map(|sub| std::str::from_utf8(sub.as_ref()).map(str::to_owned))
            .transpose()
            .map_err(|_| config_error())?
            .map(|sub| {
                if separator.is_some_and(|separator| separator == ".") {
                    sub.to_ascii_lowercase()
                } else {
                    sub
                }
            });
        let mut key: Option<String> = None;
        let mut value = Vec::new();
        for event in section.body() {
            match event {
                EventRef::SectionValueName(next) => {
                    if let Some(key) = key.take() {
                        output.push(Entry {
                            section: name.clone(),
                            subsection: subsection.clone(),
                            key,
                            value: None,
                        });
                    }
                    key = Some(
                        std::str::from_utf8(next.as_ref())
                            .map_err(|_| config_error())?
                            .to_ascii_lowercase(),
                    );
                }
                EventRef::ValueNotDone(part) => value.extend_from_slice(part.as_ref()),
                EventRef::Value(part) | EventRef::ValueDone(part) => {
                    value.extend_from_slice(part.as_ref());
                    let normalized = gix_config::value::normalize(&value);
                    let normalized = std::str::from_utf8(normalized.as_ref())
                        .map_err(|_| config_error())?
                        .to_owned();
                    output.push(Entry {
                        section: name.clone(),
                        subsection: subsection.clone(),
                        key: key.take().ok_or_else(config_error)?,
                        value: Some(normalized),
                    });
                    value.clear();
                }
                _ => {}
            }
        }
        if let Some(key) = key {
            output.push(Entry {
                section: name,
                subsection,
                key,
                value: None,
            });
        }
    }
    Ok(output)
}

fn quote(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
        .replace('\u{8}', "\\b")
}

fn serialize(entry: &Entry, output: &mut String) {
    output.push('[');
    output.push_str(&entry.section);
    if let Some(subsection) = &entry.subsection {
        output.push_str(&format!(" \"{}\"", quote(subsection)));
    }
    output.push_str("]\n");
    output.push_str(&entry.key);
    if let Some(value) = &entry.value {
        output.push_str(&format!(" = \"{}\"", quote(value)));
    }
    output.push('\n');
}

unsafe extern "C" {
    // Public libgit2 sys/config.h API, absent from git2-rs's generated bindings.
    fn git_config_backend_from_string(
        out: *mut *mut libgit2_sys::git_config_backend,
        data: *const c_char,
        len: usize,
        options: *mut c_void,
    ) -> c_int;
}

fn in_memory(data: &[u8], repo: &Repository) -> Result<Config, Error> {
    let config = Config::new()?;
    let mut backend = std::ptr::null_mut();
    // SAFETY: data remains live for the call; libgit2 copies it into the new
    // backend. Null options select documented defaults. Successful add_backend
    // transfers ownership to Config; on failure we free the unattached backend.
    unsafe {
        if git_config_backend_from_string(
            &mut backend,
            data.as_ptr().cast(),
            data.len(),
            std::ptr::null_mut(),
        ) < 0
        {
            return Err(config_error());
        }
        if libgit2_sys::git_config_add_backend(
            config.raw(),
            backend,
            libgit2_sys::GIT_CONFIG_LEVEL_LOCAL,
            repo.raw(),
            0,
        ) < 0
        {
            if let Some(free) = (*backend).free {
                free(backend);
            }
            return Err(config_error());
        }
    }
    Ok(config)
}

fn config_error() -> Error {
    Error::new(
        ErrorCode::Invalid,
        ErrorClass::Config,
        "Cannot resolve native Git configuration",
    )
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture {
        root: PathBuf,
        repo: Repository,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "poracode-native-config-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).expect("root");
            let repo = Repository::init(root.join("repo")).expect("repo");
            Self { root, repo }
        }
        fn write(&self, path: &str, content: &str) -> PathBuf {
            let path = self.root.join(path);
            fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
            fs::write(&path, content).expect("write");
            path
        }
        fn resolve(&self, roots: &[PathBuf]) -> Result<Config, Error> {
            let mut resolver = Resolver {
                repo: &self.repo,
                urls: Vec::new(),
                home: Some(self.root.clone()),
            };
            for root in roots {
                resolver.walk(root, 0, false, true, &mut Vec::new())?;
            }
            let mut values = Vec::new();
            for root in roots {
                resolver.walk(root, 0, false, false, &mut values)?;
            }
            let mut text = String::new();
            for value in values {
                serialize(&value, &mut text);
            }
            in_memory(text.as_bytes(), &self.repo)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn hasconfig_looks_ahead_and_preserves_order_relative_paths_and_sources() {
        let f = Fixture::new();
        let global = f.write("global", "[includeIf \"hasconfig:remote.*.url:https://example.test/**\"]\npath=nested/selected\n[core]\nsshCommand=after\n[include]\npath=nested/first\npath=nested/last\n");
        let selected = f.write(
            "nested/selected",
            "[core]\nsshCommand=selected\n[include]\npath=deeper\n",
        );
        let deeper = f.write("nested/deeper", "[test]\nselected=yes\n");
        f.write("nested/first", "[test]\norder=first\n");
        f.write("nested/last", "[test]\norder=last\n");
        let local = f.write(
            "local",
            "[remote \"origin\"]\nurl=https://example.test/org/repo\n",
        );
        let paths = [
            global.clone(),
            selected.clone(),
            deeper.clone(),
            local.clone(),
        ];
        let before: Vec<_> = paths
            .iter()
            .map(|path| fs::read(path).expect("read"))
            .collect();
        let config = f.resolve(&[global, local]).expect("resolve");
        assert_eq!(
            config.get_string("core.sshcommand").expect("override"),
            "after"
        );
        assert_eq!(config.get_string("test.selected").expect("selected"), "yes");
        assert_eq!(
            config.get_string("test.order").expect("ordered includes"),
            "last"
        );
        assert_eq!(
            paths
                .iter()
                .map(|path| fs::read(path).expect("read"))
                .collect::<Vec<_>>(),
            before
        );
    }

    #[test]
    fn hasconfig_files_cannot_define_remote_urls_even_when_unmatched_or_indirect() {
        let f = Fixture::new();
        let global = f.write(
            "global",
            "[includeIf \"hasconfig:remote.*.url:https://example.test/**\"]\npath=selected\n",
        );
        f.write("selected", "[include]\npath=remote\n");
        f.write(
            "remote",
            "[remote \"forbidden\"]\nurl=https://other.test/repo\n",
        );
        let local = f.write(
            "local",
            "[remote \"origin\"]\nurl=https://example.test/org/repo\n",
        );
        assert!(f.resolve(&[global.clone(), local]).is_err());
        let unmatched = f.write(
            "unmatched",
            "[remote \"origin\"]\nurl=https://unmatched.test/repo\n",
        );
        assert!(f.resolve(&[global, unmatched]).is_err());
    }

    #[test]
    fn enforces_gits_ten_include_recursion_limit() {
        let f = Fixture::new();
        for depth in 0..=10 {
            f.write(
                &format!("{depth}"),
                &format!("[include]\npath={}\n", depth + 1),
            );
        }
        f.write("11", "[test]\nvalue=yes\n");
        assert!(f.resolve(&[f.root.join("0")]).is_err());
        assert!(f.resolve(&[f.root.join("1")]).is_ok());
    }

    #[test]
    fn resolves_relative_gitdir_and_nested_onbranch_conditions() {
        let f = Fixture::new();
        f.repo.set_head("refs/heads/feature/topic").expect("branch");
        let root = f.write(
            "global",
            "[includeIf \"gitdir/i:./repo/.git\"]\npath=nested/gitdir\n",
        );
        f.write(
            "nested/gitdir",
            "[includeIf \"onbranch:feature/\"]\npath=branch\n",
        );
        f.write("nested/branch", "[ssh]\nvariant=plink\n");
        assert_eq!(
            f.resolve(&[root])
                .expect("conditions")
                .get_string("ssh.variant")
                .expect("selected"),
            "plink"
        );
    }
}
