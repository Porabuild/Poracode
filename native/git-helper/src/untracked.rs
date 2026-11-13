//! Native untracked file line counting and binary detection with thread-safe
//! `(size, mtime)` caching, porting `readUntrackedInsertions` in
//! `src/supervisor/git/statusService.ts`.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

const BINARY_SCAN_BYTES: usize = 8000;
const MAX_CACHE_ENTRIES: usize = 32_768;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileSignature {
    size: u64,
    mtime_nanos: u128,
}

#[derive(Debug, Clone, Copy)]
struct CacheEntry {
    signature: FileSignature,
    insertions: usize,
}

/// Thread-safe `(size, mtime)` cache for untracked file line counts.
#[derive(Debug, Default)]
pub struct UntrackedStatsCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
}

impl UntrackedStatsCache {
    /// Construct an empty untracked stats cache.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Return the line count for an untracked file (`0` for binaries, missing
    /// paths, directories, or unreadable files).
    pub fn read_insertions(&self, worktree_root: &str, relative_path: &str) -> usize {
        let full_path = Path::new(worktree_root).join(relative_path);
        let Ok(meta) = fs::metadata(&full_path) else {
            return 0;
        };
        if !meta.is_file() {
            return 0;
        }
        let size = meta.len();
        if size == 0 {
            return 0;
        }
        let mtime_nanos = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_nanos());
        let signature = FileSignature { size, mtime_nanos };
        let cache_key = format!("{}|{relative_path}", normalize_location_key(worktree_root));

        if let Ok(guard) = self.entries.lock()
            && let Some(cached) = guard.get(&cache_key)
            && cached.signature == signature
        {
            return cached.insertions;
        }

        let Some(insertions) = scan_file_insertions(&full_path) else {
            return 0;
        };

        if let Ok(mut guard) = self.entries.lock() {
            if guard.len() >= MAX_CACHE_ENTRIES && !guard.contains_key(&cache_key) {
                guard.clear();
            }
            guard.insert(
                cache_key,
                CacheEntry {
                    signature,
                    insertions,
                },
            );
        }
        insertions
    }
}

fn normalize_location_key(worktree_root: &str) -> String {
    if cfg!(windows) {
        worktree_root.replace('\\', "/").to_ascii_lowercase()
    } else {
        worktree_root.to_owned()
    }
}

/// Inspect up to `BINARY_SCAN_BYTES` using the exact control-byte threshold from
/// `statusService.ts`, and stream-count `\n`-delimited lines without allocating
/// the full file in memory.
#[must_use]
pub fn is_probably_binary(head: &[u8]) -> bool {
    let scan_len = head.len().min(BINARY_SCAN_BYTES);
    if scan_len == 0 {
        return false;
    }
    let mut suspicious = 0usize;
    for &byte in &head[..scan_len] {
        if byte == 0 {
            return true;
        }
        if byte < 7 || (byte > 13 && byte < 32) {
            suspicious += 1;
        }
    }
    (suspicious as f64) / (scan_len as f64) > 0.3
}

/// Count text lines in a byte slice identically to `countTextLines` in
/// `statusService.ts` (`""` -> `0`, `"a\n"` -> `1`, `"a\nb"` -> `2`).
#[must_use]
pub fn count_text_lines_bytes(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        return 0;
    }
    let newlines = bytes.iter().filter(|&&b| b == b'\n').count();
    if bytes.last() == Some(&b'\n') {
        newlines
    } else {
        newlines + 1
    }
}

fn scan_file_insertions(path: &Path) -> Option<usize> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    let mut head = Vec::with_capacity(BINARY_SCAN_BYTES);
    let mut chunk = [0u8; 8192];

    // Fill the initial binary-detection window first so huge binary files bail
    // out after reading only 8 KB instead of scanning megabytes!
    while head.len() < BINARY_SCAN_BYTES {
        let read_n = reader.read(&mut chunk).ok()?;
        if read_n == 0 {
            break;
        }
        head.extend_from_slice(&chunk[..read_n]);
    }
    if head.is_empty() {
        return Some(0);
    }
    if is_probably_binary(&head) {
        return Some(0);
    }

    let mut newlines = head.iter().filter(|&&b| b == b'\n').count();
    let mut last_byte = head.last().copied().unwrap_or(0);
    loop {
        let read_n = reader.read(&mut chunk).ok()?;
        if read_n == 0 {
            break;
        }
        let slice = &chunk[..read_n];
        newlines += slice.iter().filter(|&&b| b == b'\n').count();
        if let Some(&b) = slice.last() {
            last_byte = b;
        }
    }
    Some(if last_byte == b'\n' {
        newlines
    } else {
        newlines + 1
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_detection_matches_ts_threshold() {
        assert!(!is_probably_binary(b""));
        assert!(!is_probably_binary(b"hello\nworld\r\n\ttext"));
        assert!(is_probably_binary(b"abc\0def"));
        // > 30% control bytes in [1..6] or [14..31]
        let mostly_control = [1u8, 2u8, b'a', b'b', 3u8];
        assert!(is_probably_binary(&mostly_control));
    }

    #[test]
    fn line_counter_matches_ts_semantics() {
        assert_eq!(count_text_lines_bytes(b""), 0);
        assert_eq!(count_text_lines_bytes(b"one"), 1);
        assert_eq!(count_text_lines_bytes(b"one\n"), 1);
        assert_eq!(count_text_lines_bytes(b"one\ntwo"), 2);
        assert_eq!(count_text_lines_bytes(b"one\ntwo\n"), 2);
    }
}
