//! Native project file indexing and fuzzy/substring search for `ProjectSearchIndex`
//! (`searchProjectTree`) and `FileIndexService` (`searchProjectFiles`), keeping
//! 50k–100k path indexes in compact contiguous Rust buffers off the V8 heap.

use crate::git_exec::{SubprocessLimiter, run_git_command};
use crate::parser::to_forward_slash;
use crate::protocol::{NativeFileEntry, NativeProjectTreeEntry};
use std::cmp::Ordering;
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const TREE_MAX_INDEX_SIZE: usize = 50_000;
const TREE_CACHE_TTL: Duration = Duration::from_secs(10);
const FILES_MAX_INDEX_SIZE: usize = 100_000;
const FILES_CACHE_TTL: Duration = Duration::from_secs(15);
const MAX_CACHE_ENTRIES: usize = 4;

/// Compact metadata for one indexed file or directory inside a [`CompactPathIndex`].
#[derive(Debug, Clone, Copy)]
struct CompactEntry {
    path_offset: u32,
    path_len: u32,
    name_rel_offset: u32,
    folded_offset: u32,
    folded_len: u32,
    folded_name_rel_offset: u32,
    path_utf16_len: u32,
    is_dir: bool,
    is_ascii: bool,
}

/// Arena-allocated index of project files and derived ancestor directories.
#[derive(Debug)]
struct CompactPathIndex {
    paths_arena: String,
    folded_arena: String,
    entries: Vec<CompactEntry>,
}

impl CompactPathIndex {
    fn from_raw_entries(raw_entries: Vec<(String, bool)>) -> Self {
        let total_bytes: usize = raw_entries.iter().map(|(p, _)| p.len()).sum();
        let mut paths_arena = String::with_capacity(total_bytes);
        let mut folded_arena = String::with_capacity(total_bytes);
        let mut entries = Vec::with_capacity(raw_entries.len());

        for (path, is_dir) in raw_entries {
            let path_offset = paths_arena.len() as u32;
            let path_len = path.len() as u32;
            let name_rel = path.rfind('/').map_or(0, |idx| idx + 1);
            let is_ascii = path.is_ascii();
            let path_utf16_len = if is_ascii {
                path.len() as u32
            } else {
                path.encode_utf16().count() as u32
            };

            let folded_offset = folded_arena.len() as u32;
            let folded_name_rel = if is_ascii {
                let start = folded_arena.len();
                folded_arena.push_str(&path);
                folded_arena[start..].make_ascii_lowercase();
                name_rel
            } else {
                let prefix = &path[..name_rel];
                let name = &path[name_rel..];
                let folded_prefix = fold_search_text(prefix);
                let folded_name = fold_search_text(name);
                let rel = folded_prefix.len();
                folded_arena.push_str(&folded_prefix);
                folded_arena.push_str(&folded_name);
                rel
            };
            let folded_len = (folded_arena.len() as u32) - folded_offset;
            paths_arena.push_str(&path);

            entries.push(CompactEntry {
                path_offset,
                path_len,
                name_rel_offset: name_rel as u32,
                folded_offset,
                folded_len,
                folded_name_rel_offset: folded_name_rel as u32,
                path_utf16_len,
                is_dir,
                is_ascii,
            });
        }

        Self {
            paths_arena,
            folded_arena,
            entries,
        }
    }

    #[inline]
    fn path(&self, entry: &CompactEntry) -> &str {
        let start = entry.path_offset as usize;
        let end = start + (entry.path_len as usize);
        &self.paths_arena[start..end]
    }

    #[inline]
    fn name(&self, entry: &CompactEntry) -> &str {
        let start = (entry.path_offset + entry.name_rel_offset) as usize;
        let end = (entry.path_offset + entry.path_len) as usize;
        &self.paths_arena[start..end]
    }

    #[inline]
    fn folded_path(&self, entry: &CompactEntry) -> &str {
        let start = entry.folded_offset as usize;
        let end = start + (entry.folded_len as usize);
        &self.folded_arena[start..end]
    }

    #[inline]
    fn folded_name(&self, entry: &CompactEntry) -> &str {
        let start = (entry.folded_offset + entry.folded_name_rel_offset) as usize;
        let end = (entry.folded_offset + entry.folded_len) as usize;
        &self.folded_arena[start..end]
    }

    fn to_tree_entry(&self, entry: &CompactEntry) -> NativeProjectTreeEntry {
        NativeProjectTreeEntry {
            path: self.path(entry).to_owned(),
            name: self.name(entry).to_owned(),
            entry_type: if entry.is_dir {
                "directory".to_owned()
            } else {
                "file".to_owned()
            },
            has_children: entry.is_dir.then_some(true),
        }
    }

    fn to_file_entry(&self, entry: &CompactEntry) -> NativeFileEntry {
        NativeFileEntry {
            path: self.path(entry).to_owned(),
            name: self.name(entry).to_owned(),
            entry_type: if entry.is_dir {
                "directory".to_owned()
            } else {
                "file".to_owned()
            },
        }
    }
}

#[derive(Debug)]
struct CachedSlot {
    key: String,
    root_key: String,
    created_at: Instant,
    index: Arc<CompactPathIndex>,
}

///Bounded LRU cache for tree (`ProjectSearchIndex`) and `@file` (`FileIndexService`) indexes.
#[derive(Debug, Default)]
pub struct NativeSearchCache {
    tree_slots: Mutex<VecDeque<CachedSlot>>,
    file_slots: Mutex<VecDeque<CachedSlot>>,
}

/// Parameters for a `searchTree` or `searchFiles` request.
#[derive(Debug, Clone)]
pub struct SearchParams<'a> {
    /// Absolute filesystem root of the project/worktree.
    pub root_path: &'a str,
    /// Raw user search query.
    pub query: &'a str,
    /// Maximum entries to return.
    pub limit: usize,
    /// Optional `"file"` or `"directory"` filter (`searchTree` only).
    pub entry_type: Option<&'a str>,
    /// Whether `.gitignore` / `--exclude-standard` rules apply.
    pub use_ignore_files: bool,
    /// Glob exclude patterns.
    pub exclude_patterns: &'a [String],
    /// Git subprocess timeout.
    pub timeout: Duration,
}

impl NativeSearchCache {
    /// Construct an empty search cache.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Invalidate cached indexes for `root_path`, or all cached indexes when `None`.
    pub fn invalidate(&self, root_path: Option<&str>) {
        let target_key = root_path.map(normalize_root_key);
        for cache in [&self.tree_slots, &self.file_slots] {
            let mut guard = match cache.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            match target_key {
                None => guard.clear(),
                Some(ref rk) => guard.retain(|slot| &slot.root_key != rk),
            }
        }
    }

    /// Execute `ProjectSearchIndex.searchProjectTree` natively.
    pub fn search_tree(
        &self,
        params: &SearchParams<'_>,
        limiter: &SubprocessLimiter,
    ) -> Vec<NativeProjectTreeEntry> {
        let trimmed = params.query.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let folded_query = fold_search_text(trimmed);
        let terms: Vec<&str> = folded_query
            .split_whitespace()
            .filter(|t| !t.is_empty())
            .collect();
        if terms.is_empty() {
            return Vec::new();
        }
        if params.limit == 0 {
            return Vec::new();
        }

        let index = self.get_or_build_tree_index(params, limiter);
        let filter_dirs = match params.entry_type {
            Some("file") => Some(false),
            Some("directory") => Some(true),
            _ => None,
        };

        let term_meta: Vec<(&str, usize, bool)> = terms
            .iter()
            .map(|&t| {
                let ascii = t.is_ascii();
                let u16_len = if ascii {
                    t.len()
                } else {
                    t.encode_utf16().count()
                };
                (t, u16_len, ascii)
            })
            .collect();

        let mut scored: Vec<(usize, f64)> = Vec::new();
        for (idx, entry) in index.entries.iter().enumerate() {
            if let Some(want_dir) = filter_dirs
                && entry.is_dir != want_dir
            {
                continue;
            }
            if let Some(score) = score_file_search_entry(&index, entry, &folded_query, &term_meta) {
                scored.push((idx, score));
            }
        }

        let cmp =
            |&(idx_a, score_a): &(usize, f64), &(idx_b, score_b): &(usize, f64)| -> Ordering {
                let score_ord = score_b.total_cmp(&score_a);
                if score_ord != Ordering::Equal {
                    return score_ord;
                }
                let ea = &index.entries[idx_a];
                let eb = &index.entries[idx_b];
                if ea.is_dir != eb.is_dir {
                    return if !ea.is_dir {
                        Ordering::Less
                    } else {
                        Ordering::Greater
                    };
                }
                let len_ord = ea.path_utf16_len.cmp(&eb.path_utf16_len);
                if len_ord != Ordering::Equal {
                    return len_ord;
                }
                natural_cmp_ignore_case(index.path(ea), index.path(eb))
            };

        let keep = params.limit.min(scored.len());
        if scored.len() > keep {
            scored.select_nth_unstable_by(keep - 1, cmp);
            scored.truncate(keep);
        }
        scored.sort_unstable_by(cmp);

        scored
            .into_iter()
            .map(|(idx, _)| index.to_tree_entry(&index.entries[idx]))
            .collect()
    }

    /// Execute `FileIndexService.searchProjectFiles` natively, returning `(entries, totalIndexed)`.
    pub fn search_files(
        &self,
        params: &SearchParams<'_>,
        limiter: &SubprocessLimiter,
    ) -> (Vec<NativeFileEntry>, usize) {
        let index = self.get_or_build_files_index(params, limiter);
        let total = index.entries.len();
        if params.limit == 0 || total == 0 {
            return (Vec::new(), total);
        }
        if params.query.is_empty() {
            let take = params.limit.min(total);
            let slice = index.entries[..take]
                .iter()
                .map(|e| index.to_file_entry(e))
                .collect();
            return (slice, total);
        }

        let query_lower = params.query.to_lowercase();
        let mut scored: Vec<(usize, u8)> = Vec::new();
        for (idx, entry) in index.entries.iter().enumerate() {
            let score = if entry.is_ascii && query_lower.is_ascii() {
                let name_l = index.folded_name(entry);
                let path_l = index.folded_path(entry);
                if name_l.starts_with(&query_lower) {
                    3
                } else if name_l.contains(&query_lower) {
                    2
                } else if path_l.contains(&query_lower) {
                    1
                } else {
                    0
                }
            } else {
                let name_l = index.name(entry).to_lowercase();
                if name_l.starts_with(&query_lower) {
                    3
                } else if name_l.contains(&query_lower) {
                    2
                } else if index.path(entry).to_lowercase().contains(&query_lower) {
                    1
                } else {
                    0
                }
            };
            if score > 0 {
                scored.push((idx, score));
            }
        }

        let cmp = |&(idx_a, score_a): &(usize, u8), &(idx_b, score_b): &(usize, u8)| -> Ordering {
            let s_ord = score_b.cmp(&score_a);
            if s_ord != Ordering::Equal {
                return s_ord;
            }
            let ea = &index.entries[idx_a];
            let eb = &index.entries[idx_b];
            if ea.is_dir != eb.is_dir {
                return if !ea.is_dir {
                    Ordering::Less
                } else {
                    Ordering::Greater
                };
            }
            let len_ord = ea.path_utf16_len.cmp(&eb.path_utf16_len);
            if len_ord != Ordering::Equal {
                return len_ord;
            }
            natural_cmp_ignore_case(index.path(ea), index.path(eb))
        };

        let keep = params.limit.min(scored.len());
        if scored.len() > keep {
            scored.select_nth_unstable_by(keep - 1, cmp);
            scored.truncate(keep);
        }
        scored.sort_unstable_by(cmp);

        let out = scored
            .into_iter()
            .map(|(idx, _)| index.to_file_entry(&index.entries[idx]))
            .collect();
        (out, total)
    }

    fn get_or_build_tree_index(
        &self,
        params: &SearchParams<'_>,
        limiter: &SubprocessLimiter,
    ) -> Arc<CompactPathIndex> {
        let root_key = normalize_root_key(params.root_path);
        let cache_key =
            build_cache_key(&root_key, params.use_ignore_files, params.exclude_patterns);

        if let Some(hit) = lookup_lru(&self.tree_slots, &cache_key, TREE_CACHE_TTL) {
            return hit;
        }

        let built = Arc::new(build_tree_index(params, limiter));
        insert_lru(&self.tree_slots, cache_key, root_key, Arc::clone(&built));
        built
    }

    fn get_or_build_files_index(
        &self,
        params: &SearchParams<'_>,
        limiter: &SubprocessLimiter,
    ) -> Arc<CompactPathIndex> {
        let root_key = normalize_root_key(params.root_path);
        let cache_key =
            build_cache_key(&root_key, params.use_ignore_files, params.exclude_patterns);

        if let Some(hit) = lookup_lru(&self.file_slots, &cache_key, FILES_CACHE_TTL) {
            return hit;
        }

        let built = Arc::new(build_files_index(params, limiter));
        insert_lru(&self.file_slots, cache_key, root_key, Arc::clone(&built));
        built
    }
}

fn lookup_lru(
    slots: &Mutex<VecDeque<CachedSlot>>,
    key: &str,
    ttl: Duration,
) -> Option<Arc<CompactPathIndex>> {
    let mut guard = match slots.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let pos = guard.iter().position(|s| s.key == key)?;
    if guard[pos].created_at.elapsed() >= ttl {
        guard.remove(pos);
        return None;
    }
    let slot = guard.remove(pos)?;
    let index = Arc::clone(&slot.index);
    guard.push_back(slot);
    Some(index)
}

fn insert_lru(
    slots: &Mutex<VecDeque<CachedSlot>>,
    key: String,
    root_key: String,
    index: Arc<CompactPathIndex>,
) {
    let mut guard = match slots.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    guard.retain(|s| s.key != key);
    while guard.len() >= MAX_CACHE_ENTRIES {
        guard.pop_front();
    }
    guard.push_back(CachedSlot {
        key,
        root_key,
        created_at: Instant::now(),
        index,
    });
}

fn normalize_root_key(root_path: &str) -> String {
    if cfg!(windows) {
        root_path.replace('\\', "/").to_ascii_lowercase()
    } else {
        root_path.to_owned()
    }
}

fn build_cache_key(root_key: &str, use_ignore_files: bool, exclude_patterns: &[String]) -> String {
    let mut sorted = exclude_patterns.to_vec();
    sorted.sort();
    // JSON-encode patterns so `["a,b"]` and `["a", "b"]` never collide!
    let encoded_patterns = serde_json::to_string(&sorted).unwrap_or_default();
    format!(
        "{root_key}:{}:{encoded_patterns}",
        if use_ignore_files { 1 } else { 0 }
    )
}

fn partition_exclude_patterns(patterns: &[String]) -> (HashSet<String>, Vec<GlobMatcher>) {
    let mut ignore_names = HashSet::new();
    ignore_names.insert(".git".to_owned());
    let mut residual = Vec::new();

    for p in patterns {
        if let Some(simple) = extract_simple_ignore_name(p) {
            ignore_names.insert(simple.to_owned());
        } else {
            residual.push(GlobMatcher::new(p));
            if !p.ends_with("/**") && !p.ends_with('*') {
                residual.push(GlobMatcher::new(&format!("{p}/**")));
            }
        }
    }
    (ignore_names, residual)
}

fn extract_simple_ignore_name(pattern: &str) -> Option<&str> {
    let rest = pattern.strip_prefix("**/")?;
    let name = rest.strip_suffix("/**").unwrap_or(rest);
    if name.is_empty()
        || name
            .bytes()
            .any(|b| matches!(b, b'/' | b'*' | b'?' | b'[' | b']'))
    {
        return None;
    }
    Some(name)
}

fn path_hits_ignored_name(path: &str, ignore_set: &HashSet<String>) -> bool {
    if ignore_set.is_empty() {
        return false;
    }
    path.split('/').any(|seg| ignore_set.contains(seg))
}

fn matches_any_glob(path: &str, matchers: &[GlobMatcher]) -> bool {
    matchers.iter().any(|m| m.is_match(path))
}

fn build_tree_index(params: &SearchParams<'_>, limiter: &SubprocessLimiter) -> CompactPathIndex {
    let (ignore_set, residual_globs) = partition_exclude_patterns(params.exclude_patterns);

    let mut raw: Option<Vec<(String, bool)>> = None;
    if params.use_ignore_files {
        raw = build_tree_from_git(params.root_path, &ignore_set, params.timeout, limiter);
    }
    let mut entries = raw.unwrap_or_else(|| build_tree_from_walk(params.root_path, &ignore_set));

    if !residual_globs.is_empty() {
        entries.retain(|(path, _)| !matches_any_glob(path, &residual_globs));
    }
    CompactPathIndex::from_raw_entries(entries)
}

fn build_tree_from_git(
    root_path: &str,
    ignore_set: &HashSet<String>,
    timeout: Duration,
    limiter: &SubprocessLimiter,
) -> Option<Vec<(String, bool)>> {
    if !Path::new(root_path).is_dir() {
        return None;
    }
    let out = run_git_command(
        root_path,
        &["ls-files", "--cached", "--others", "--exclude-standard"],
        timeout,
        limiter,
    )
    .ok()?;
    if !out.ok {
        return None;
    }

    let mut files = Vec::new();
    for raw_line in out.stdout.split('\n') {
        if raw_line.is_empty() {
            continue;
        }
        let normalized = to_forward_slash(raw_line);
        if path_hits_ignored_name(&normalized, ignore_set) {
            continue;
        }
        files.push(normalized);
        if files.len() >= TREE_MAX_INDEX_SIZE {
            break;
        }
    }

    let mut entries = Vec::with_capacity(files.len() + files.len() / 4);
    let mut dir_set = HashSet::new();
    let mut dir_order = Vec::new();

    for fp in files {
        for (idx, b) in fp.bytes().enumerate() {
            if b == b'/' {
                let dir = &fp[..idx];
                if !dir.is_empty() && !dir_set.contains(dir) {
                    let owned = dir.to_owned();
                    dir_set.insert(owned.clone());
                    dir_order.push(owned);
                }
            }
        }
        entries.push((fp, false));
    }
    for dp in dir_order {
        entries.push((dp, true));
    }
    Some(entries)
}

fn build_tree_from_walk(root_path: &str, ignore_set: &HashSet<String>) -> Vec<(String, bool)> {
    let root = Path::new(root_path);
    if !root.is_dir() {
        return Vec::new();
    }
    let mut stack = vec![String::new()];
    let mut results = Vec::new();

    while let Some(rel_dir) = stack.pop() {
        if results.len() >= TREE_MAX_INDEX_SIZE {
            break;
        }
        let full_dir = if rel_dir.is_empty() {
            root.to_path_buf()
        } else {
            root.join(&rel_dir)
        };
        let Ok(read_dir) = fs::read_dir(&full_dir) else {
            continue;
        };
        for item in read_dir.flatten() {
            let file_name_os = item.file_name();
            let Some(name) = file_name_os.to_str() else {
                continue;
            };
            if ignore_set.contains(name) {
                continue;
            }
            let Ok(ft) = item.file_type() else {
                continue;
            };
            // Never traverse symlinked directories or junctions out of the root.
            if ft.is_symlink() {
                continue;
            }
            let rel_path = if rel_dir.is_empty() {
                name.to_owned()
            } else {
                format!("{rel_dir}/{name}")
            };
            if ft.is_dir() {
                results.push((rel_path.clone(), true));
                if results.len() >= TREE_MAX_INDEX_SIZE {
                    break;
                }
                stack.push(rel_path);
            } else {
                results.push((rel_path, false));
                if results.len() >= TREE_MAX_INDEX_SIZE {
                    break;
                }
            }
        }
    }
    results
}

fn build_files_index(params: &SearchParams<'_>, limiter: &SubprocessLimiter) -> CompactPathIndex {
    if !Path::new(params.root_path).is_dir() {
        return CompactPathIndex::from_raw_entries(Vec::new());
    }
    let args: &[&str] = if params.use_ignore_files {
        &["ls-files", "--cached", "--others", "--exclude-standard"]
    } else {
        &["ls-files", "--cached", "--others"]
    };
    let Ok(out) = run_git_command(params.root_path, args, params.timeout, limiter) else {
        return CompactPathIndex::from_raw_entries(Vec::new());
    };
    if !out.ok {
        return CompactPathIndex::from_raw_entries(Vec::new());
    }

    let (ignore_set, residual_globs) = if params.exclude_patterns.is_empty() {
        (HashSet::new(), Vec::new())
    } else {
        let mut names = HashSet::new();
        let mut globs = Vec::new();
        for p in params.exclude_patterns {
            if let Some(simple) = extract_simple_ignore_name(p) {
                names.insert(simple.to_owned());
            } else {
                globs.push(GlobMatcher::new(p));
                if !p.ends_with("/**") && !p.ends_with('*') {
                    globs.push(GlobMatcher::new(&format!("{p}/**")));
                }
            }
        }
        (names, globs)
    };

    let mut file_paths = Vec::new();
    for raw_line in out.stdout.split('\n') {
        if raw_line.is_empty() {
            continue;
        }
        let normalized = to_forward_slash(raw_line);
        if !ignore_set.is_empty() && path_hits_ignored_name(&normalized, &ignore_set) {
            continue;
        }
        if !residual_globs.is_empty() && matches_any_glob(&normalized, &residual_globs) {
            continue;
        }
        file_paths.push(normalized);
        if file_paths.len() >= FILES_MAX_INDEX_SIZE {
            break;
        }
    }

    let mut dir_set = HashSet::new();
    for fp in &file_paths {
        for (idx, b) in fp.bytes().enumerate() {
            if b == b'/' {
                let dir = &fp[..idx];
                if !dir.is_empty() && !dir_set.contains(dir) {
                    dir_set.insert(dir.to_owned());
                }
            }
        }
    }

    let mut entries = Vec::with_capacity(file_paths.len() + dir_set.len());
    for fp in file_paths {
        entries.push((fp, false));
    }
    for dp in dir_set {
        entries.push((dp, true));
    }
    entries.sort_unstable_by(|(a, _), (b, _)| natural_cmp_ignore_case(a, b));
    CompactPathIndex::from_raw_entries(entries)
}

/// Exact port of `scoreFileSearchEntry` in `src/shared/searchMatching.ts`.
fn score_file_search_entry(
    index: &CompactPathIndex,
    entry: &CompactEntry,
    folded_query: &str,
    terms: &[(&str, usize, bool)],
) -> Option<f64> {
    let folded_name = index.folded_name(entry);
    let folded_path = index.folded_path(entry);
    let text_ascii = entry.is_ascii;

    let mut total = 0.0_f64;
    for &(term, term_u16_len, term_ascii) in terms {
        let ascii_pair = text_ascii && term_ascii;
        let m_name = match_text(folded_name, term, term_u16_len, ascii_pair);
        let m_path = match_text(folded_path, term, term_u16_len, ascii_pair);

        let mut best = 0.0_f64;
        if let Some(s) = m_name {
            best = best.max(f64::from(s));
        }
        if let Some(s) = m_path {
            best = best.max(f64::from(s) * 0.4);
        }
        if best == 0.0 {
            return None;
        }
        total += best;
    }

    // Whole-phrase bonus applies only to fields with weight >= 1 (`entry.name`).
    if folded_name == folded_query {
        total += 200.0;
    } else if folded_name.starts_with(folded_query) {
        total += 60.0;
    }
    Some(total)
}

fn is_ascii_alphanumeric_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric()
}

/// Port of `matchText(text, term, fuzzy = true)` in `src/shared/searchMatching.ts`.
fn match_text(text: &str, term: &str, term_u16_len: usize, both_ascii: bool) -> Option<i32> {
    if let Some(byte_start) = text.find(term) {
        let (start_u16, boundary) = if both_ascii {
            let bnd =
                byte_start == 0 || !is_ascii_alphanumeric_byte(text.as_bytes()[byte_start - 1]);
            (byte_start, bnd)
        } else {
            let prefix = &text[..byte_start];
            let u16_pos = prefix.encode_utf16().count();
            let bnd = prefix
                .chars()
                .next_back()
                .is_none_or(|c| !c.is_alphanumeric());
            (u16_pos, bnd)
        };
        let base = if text.len() == term.len() {
            240
        } else if start_u16 == 0 {
            200
        } else if boundary {
            160
        } else {
            140
        };
        let penalty = start_u16.min(30) as i32;
        return Some(base - penalty);
    }

    if term_u16_len < 2 {
        return None;
    }

    if both_ascii {
        let hay = text.as_bytes();
        let needle = term.as_bytes();
        let mut first = usize::MAX;
        let mut cursor = 0usize;
        for &nb in needle {
            let rel = hay[cursor..].iter().position(|&hb| hb == nb)?;
            let pos = cursor + rel;
            if first == usize::MAX {
                first = pos;
            }
            cursor = pos + 1;
        }
        let gap = cursor - first - term_u16_len;
        if gap > 32 {
            return None;
        }
        let bonus = if first == 0 { 10 } else { 0 };
        let penalty = (first + gap).min(40) as i32;
        return Some(60 + bonus - penalty);
    }

    let mut first_u16: Option<usize> = None;
    let mut cursor_byte = 0usize;
    let mut cursor_u16 = 0usize;
    for ch in term.chars() {
        let rel_byte = text[cursor_byte..].find(ch)?;
        cursor_u16 += text[cursor_byte..cursor_byte + rel_byte]
            .encode_utf16()
            .count();
        if first_u16.is_none() {
            first_u16 = Some(cursor_u16);
        }
        cursor_byte += rel_byte + ch.len_utf8();
        cursor_u16 += ch.len_utf16();
    }
    let first = first_u16?;
    let gap = cursor_u16 - first - term_u16_len;
    if gap > 32 {
        return None;
    }
    let bonus = if first == 0 { 10 } else { 0 };
    let penalty = (first + gap).min(40) as i32;
    Some(60 + bonus - penalty)
}

/// Fold diacritics (NFD + `\p{M}` removal) and lowercase text, matching
/// `normalizeSearchText` in `src/shared/searchMatching.ts`.
#[must_use]
pub fn fold_search_text(text: &str) -> String {
    if text.is_ascii() {
        return text.to_ascii_lowercase();
    }
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        if is_combining_mark(ch) {
            continue;
        }
        if let Some(base) = decompose_accented_base(ch) {
            out.push_str(base);
        } else {
            for lower in ch.to_lowercase() {
                if !is_combining_mark(lower) {
                    out.push(lower);
                }
            }
        }
    }
    out
}

fn is_combining_mark(ch: char) -> bool {
    let u = ch as u32;
    (0x0300..=0x036F).contains(&u)
        || (0x0483..=0x0489).contains(&u)
        || (0x0591..=0x05C7).contains(&u)
        || (0x064B..=0x065F).contains(&u)
        || (0x1AB0..=0x1AFF).contains(&u)
        || (0x1DC0..=0x1DFF).contains(&u)
        || (0x20D0..=0x20FF).contains(&u)
        || (0xFE20..=0xFE2F).contains(&u)
}

/// Map precomposed Latin-1, Latin Extended-A/B, Latin Extended Additional
/// (Vietnamese), Greek, and Cyrillic diacritic letters to their lowercase NFD
/// base characters (after `\p{M}` removal).
fn decompose_accented_base(ch: char) -> Option<&'static str> {
    let lower = ch.to_lowercase().next().unwrap_or(ch);
    match lower {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' | 'ǎ' | 'ȁ' | 'ȃ' | 'ȧ' | 'ạ' | 'ả'
        | 'ấ' | 'ầ' | 'ẩ' | 'ẫ' | 'ậ' | 'ắ' | 'ằ' | 'ẳ' | 'ẵ' | 'ặ' => {
            Some("a")
        }
        'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' => Some("c"),
        'ď' | 'ḍ' | 'ḏ' | 'đ' => Some("d"),
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' | 'ȅ' | 'ȇ' | 'ȩ' | 'ẹ' | 'ẻ' | 'ẽ'
        | 'ế' | 'ề' | 'ể' | 'ễ' | 'ệ' => Some("e"),
        'ĝ' | 'ğ' | 'ġ' | 'ģ' | 'ǧ' | 'ǵ' => Some("g"),
        'ĥ' | 'ȟ' | 'ḥ' | 'ḧ' | 'ḩ' | 'ḫ' => Some("h"),
        'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'ǐ' | 'ȉ' | 'ȋ' | 'ỉ' | 'ị' => {
            Some("i")
        }
        'ĵ' => Some("j"),
        'ķ' | 'ǩ' | 'ḱ' | 'ḳ' | 'ḵ' => Some("k"),
        'ĺ' | 'ļ' | 'ľ' | 'ḷ' | 'ḻ' => Some("l"),
        'ñ' | 'ń' | 'ņ' | 'ň' | 'ǹ' | 'ṅ' | 'ṇ' | 'ṉ' => Some("n"),
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ō' | 'ŏ' | 'ő' | 'ơ' | 'ǒ' | 'ǫ' | 'ǭ' | 'ȍ' | 'ȏ' | 'ȫ'
        | 'ȭ' | 'ȯ' | 'ȱ' | 'ọ' | 'ỏ' | 'ố' | 'ồ' | 'ổ' | 'ỗ' | 'ộ' | 'ớ' | 'ờ' | 'ở' | 'ỡ'
        | 'ợ' => Some("o"),
        'ŕ' | 'ŗ' | 'ř' | 'ȑ' | 'ȓ' | 'ṙ' | 'ṛ' => Some("r"),
        'ś' | 'ŝ' | 'ş' | 'š' | 'ș' | 'ṡ' | 'ṣ' => Some("s"),
        'ţ' | 'ť' | 'ț' | 'ṫ' | 'ṭ' | 'ṯ' => Some("t"),
        'ù' | 'ú' | 'û' | 'ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' | 'ư' | 'ǔ' | 'ǖ' | 'ǘ' | 'ǚ'
        | 'ǜ' | 'ȕ' | 'ȗ' | 'ụ' | 'ủ' | 'ứ' | 'ừ' | 'ử' | 'ữ' | 'ự' => Some("u"),
        'ŵ' | 'ẁ' | 'ẃ' | 'ẅ' => Some("w"),
        'ý' | 'ÿ' | 'ŷ' | 'ȳ' | 'ỳ' | 'ỵ' | 'ỷ' | 'ỹ' => Some("y"),
        'ź' | 'ż' | 'ž' | 'ẑ' | 'ẓ' => Some("z"),
        // Greek monotonic & polytonic NFD base letters
        'ά' | 'ἀ' | 'ἁ' | 'ἂ' | 'ἃ' | 'ἄ' | 'ἅ' | 'ἆ' | 'ἇ' | 'ὰ' | 'ά' | 'ᾶ' => {
            Some("α")
        }
        'έ' | 'ἐ' | 'ἑ' | 'ἒ' | 'ἓ' | 'ἔ' | 'ἕ' | 'ὲ' | 'έ' => Some("ε"),
        'ή' | 'ἠ' | 'ἡ' | 'ἢ' | 'ἣ' | 'ἤ' | 'ἥ' | 'ἦ' | 'ἧ' | 'ὴ' | 'ή' | 'ῆ' => {
            Some("η")
        }
        'ί' | 'ϊ' | 'ΐ' | 'ἰ' | 'ἱ' | 'ἲ' | 'ἳ' | 'ἴ' | 'ἵ' | 'ἶ' | 'ἷ' | 'ὶ' | 'ί' | 'ῖ' => {
            Some("ι")
        }
        'ό' | 'ὀ' | 'ὁ' | 'ὂ' | 'ὃ' | 'ὄ' | 'ὅ' | 'ὸ' | 'ό' => Some("ο"),
        'ύ' | 'ϋ' | 'ΰ' | 'ὐ' | 'ὑ' | 'ὒ' | 'ὓ' | 'ὔ' | 'ὕ' | 'ὖ' | 'ὗ' | 'ὺ' | 'ύ' | 'ῦ' => {
            Some("υ")
        }
        'ώ' | 'ὠ' | 'ὡ' | 'ὢ' | 'ὣ' | 'ὤ' | 'ὥ' | 'ὦ' | 'ὧ' | 'ὼ' | 'ώ' | 'ῶ' => {
            Some("ω")
        }
        // Cyrillic NFD decompositions (`ё` -> `е` + U+0308, `й` -> `и` + U+0306)
        'ё' | 'ѐ' => Some("е"),
        'й' | 'ѝ' => Some("и"),
        'ї' => Some("і"),
        'ѓ' => Some("г"),
        'ќ' => Some("к"),
        'ў' => Some("у"),
        _ => None,
    }
}

/// Natural numeric + case-insensitive comparator matching
/// `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`.
#[must_use]
pub fn natural_cmp_ignore_case(a: &str, b: &str) -> Ordering {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    let mut ia = 0usize;
    let mut ib = 0usize;

    while ia < ab.len() && ib < bb.len() {
        let ca = ab[ia];
        let cb = bb[ib];
        if ca.is_ascii_digit() && cb.is_ascii_digit() {
            let start_a = ia;
            while ia < ab.len() && ab[ia].is_ascii_digit() {
                ia += 1;
            }
            let start_b = ib;
            while ib < bb.len() && bb[ib].is_ascii_digit() {
                ib += 1;
            }
            let trim_a = ab[start_a..ia]
                .iter()
                .position(|&d| d != b'0')
                .map_or(&b""[..], |p| &ab[start_a + p..ia]);
            let trim_b = bb[start_b..ib]
                .iter()
                .position(|&d| d != b'0')
                .map_or(&b""[..], |p| &bb[start_b + p..ib]);
            let num_ord = trim_a
                .len()
                .cmp(&trim_b.len())
                .then_with(|| trim_a.cmp(trim_b));
            if num_ord != Ordering::Equal {
                return num_ord;
            }
            continue;
        }
        if ca < 128 && cb < 128 {
            let la = ca.to_ascii_lowercase();
            let lb = cb.to_ascii_lowercase();
            if la != lb {
                return la.cmp(&lb);
            }
            ia += 1;
            ib += 1;
            continue;
        }
        // Fallback to scalar comparison on non-ASCII tail
        let mut chars_a = a[ia..].chars();
        let mut chars_b = b[ib..].chars();
        let Some(cha) = chars_a.next() else { break };
        let Some(chb) = chars_b.next() else { break };
        let fa = fold_search_text(&cha.to_string());
        let fb = fold_search_text(&chb.to_string());
        if fa != fb {
            return fa.cmp(&fb);
        }
        ia += cha.len_utf8();
        ib += chb.len_utf8();
    }
    ab.len().cmp(&bb.len()).then_with(|| a.cmp(b))
}

/// Lightweight glob matcher supporting `*`, `**`, `?`, and `[...]` segment patterns
/// with `dot: true` semantics.
#[derive(Debug, Clone)]
struct GlobMatcher {
    segments: Vec<String>,
}

impl GlobMatcher {
    fn new(pattern: &str) -> Self {
        let normalized = pattern.trim_matches('/');
        let segments = if normalized.is_empty() {
            Vec::new()
        } else {
            normalized.split('/').map(str::to_owned).collect()
        };
        Self { segments }
    }

    fn is_match(&self, path: &str) -> bool {
        let path_segs: Vec<&str> = path
            .trim_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();
        match_glob_segments(&self.segments, &path_segs)
    }
}

fn match_glob_segments(pat: &[String], path: &[&str]) -> bool {
    if pat.is_empty() {
        return path.is_empty();
    }
    if pat[0] == "**" {
        // Zero or more directory segments
        if match_glob_segments(&pat[1..], path) {
            return true;
        }
        if !path.is_empty() {
            return match_glob_segments(pat, &path[1..]);
        }
        return false;
    }
    if path.is_empty() {
        return false;
    }
    if !match_segment_pattern(&pat[0], path[0]) {
        return false;
    }
    match_glob_segments(&pat[1..], &path[1..])
}

fn match_segment_pattern(pat: &str, text: &str) -> bool {
    let p_chars: Vec<char> = pat.chars().collect();
    let t_chars: Vec<char> = text.chars().collect();
    match_chars(&p_chars, &t_chars)
}

fn match_chars(pat: &[char], text: &[char]) -> bool {
    let mut pi = 0usize;
    let mut ti = 0usize;
    let mut star_pi: Option<usize> = None;
    let mut star_ti = 0usize;

    while ti < text.len() {
        if pi < pat.len() && pat[pi] == '*' {
            star_pi = Some(pi);
            star_ti = ti;
            pi += 1;
        } else if pi < pat.len() && pat[pi] == '?' {
            pi += 1;
            ti += 1;
        } else if pi < pat.len()
            && pat[pi] == '['
            && let Some((matched, next_pi)) = match_char_class(&pat[pi..], text[ti])
        {
            if matched {
                pi += next_pi;
                ti += 1;
            } else if let Some(sp) = star_pi {
                pi = sp + 1;
                star_ti += 1;
                ti = star_ti;
            } else {
                return false;
            }
        } else if pi < pat.len() && pat[pi] == text[ti] {
            pi += 1;
            ti += 1;
        } else if let Some(sp) = star_pi {
            pi = sp + 1;
            star_ti += 1;
            ti = star_ti;
        } else {
            return false;
        }
    }

    while pi < pat.len() && pat[pi] == '*' {
        pi += 1;
    }
    pi == pat.len()
}

fn match_char_class(pat: &[char], ch: char) -> Option<(bool, usize)> {
    if pat.first() != Some(&'[') {
        return None;
    }
    let mut idx = 1usize;
    let negated = if idx < pat.len() && (pat[idx] == '!' || pat[idx] == '^') {
        idx += 1;
        true
    } else {
        false
    };
    let close = pat[idx..].iter().position(|&c| c == ']')? + idx;
    let mut hit = false;
    let mut i = idx;
    while i < close {
        if i + 2 < close && pat[i + 1] == '-' {
            if ch >= pat[i] && ch <= pat[i + 2] {
                hit = true;
            }
            i += 3;
        } else {
            if ch == pat[i] {
                hit = true;
            }
            i += 1;
        }
    }
    Some((if negated { !hit } else { hit }, close + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_diacritics_and_combining_marks_identically_to_ts() {
        assert_eq!(fold_search_text("src/Café.ts"), "src/cafe.ts");
        assert_eq!(fold_search_text("Cafe\u{0301}.ts"), "cafe.ts");
        assert_eq!(fold_search_text("CommandPalette.tsx"), "commandpalette.tsx");
        assert_eq!(fold_search_text("über_señor.md"), "uber_senor.md");
    }

    #[test]
    fn scores_literal_ahead_of_abbreviation_and_reordered_terms() {
        let index = CompactPathIndex::from_raw_entries(vec![
            ("src/CommandPalette.tsx".to_owned(), false),
            ("src/cmdplt.ts".to_owned(), false),
            ("src/Café.ts".to_owned(), false),
            ("src/components/search/CommandPalette.tsx".to_owned(), false),
            ("src/components/search/Other.tsx".to_owned(), false),
        ]);

        let s_literal =
            score_file_search_entry(&index, &index.entries[1], "cmdplt", &[("cmdplt", 6, true)])
                .unwrap_or(0.0);
        let s_fuzzy =
            score_file_search_entry(&index, &index.entries[0], "cmdplt", &[("cmdplt", 6, true)])
                .unwrap_or(0.0);
        assert!(s_literal > s_fuzzy);

        let s_cafe =
            score_file_search_entry(&index, &index.entries[2], "cafe", &[("cafe", 4, true)]);
        assert!(s_cafe.is_some());

        let reordered_terms = [("palette", 7, true), ("components", 10, true)];
        let s_reordered = score_file_search_entry(
            &index,
            &index.entries[3],
            "palette components",
            &reordered_terms,
        );
        let s_other = score_file_search_entry(
            &index,
            &index.entries[4],
            "palette components",
            &reordered_terms,
        );
        assert!(s_reordered.is_some());
        assert!(s_other.is_none());
    }

    #[test]
    fn glob_matcher_handles_double_star_and_wildcards() {
        let m1 = GlobMatcher::new("**/generated/**");
        assert!(m1.is_match("src/generated/foo.ts"));
        assert!(m1.is_match("generated/a/b.ts"));
        assert!(!m1.is_match("src/main.ts"));

        let m2 = GlobMatcher::new("src/**/*.gen.ts");
        assert!(m2.is_match("src/api/types.gen.ts"));
        assert!(m2.is_match("src/types.gen.ts"));
        assert!(!m2.is_match("src/types.ts"));
    }

    #[test]
    fn natural_comparator_sorts_numbers_numerically() {
        assert_eq!(
            natural_cmp_ignore_case("file-2.ts", "file-10.ts"),
            Ordering::Less
        );
        assert_eq!(
            natural_cmp_ignore_case("src/A.ts", "src/b.ts"),
            Ordering::Less
        );
    }
}
