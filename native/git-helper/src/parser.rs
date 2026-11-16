//! Pure Git output parsers porting `src/supervisor/git/statusParsing.ts` and
//! `unquoteGitPath` from `src/shared/reviewDiff.ts` with exact parity.

use crate::protocol::GitFileChange;
use std::collections::HashMap;

/// Parsed porcelain v2 status before numstat filtering or untracked expansion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPorcelainStatus {
    /// Branch head name.
    pub branch: String,
    /// Head commit SHA.
    pub head_sha: String,
    /// Upstream tracking ref.
    pub tracking: String,
    /// Ahead commit count.
    pub ahead: usize,
    /// Behind commit count.
    pub behind: usize,
    /// Staged index changes.
    pub staged: Vec<GitFileChange>,
    /// Unstaged working-tree changes.
    pub unstaged: Vec<GitFileChange>,
    /// Unmerged conflict paths.
    pub conflict_files: Vec<String>,
    /// Whether unmerged conflict records (`u `) were present.
    pub merge_in_progress: bool,
}

/// One parsed `git diff --numstat` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffStatEntry {
    /// Normalized forward-slash destination path.
    pub path: String,
    /// Line insertions (`0` for binary `-`).
    pub insertions: usize,
    /// Line deletions (`0` for binary `-`).
    pub deletions: usize,
}

/// Normalize Windows backslashes to forward slashes.
#[must_use]
pub fn to_forward_slash(path: &str) -> String {
    if path.contains('\\') {
        path.replace('\\', "/")
    } else {
        path.to_owned()
    }
}

/// Decode Git's C-quoted UTF-8 paths (`"\321\204.txt"` -> `"ф.txt"`), matching
/// `unquoteGitPath` in `src/shared/reviewDiff.ts`.
#[must_use]
pub fn unquote_git_path(raw: &str) -> String {
    if raw.len() < 2 || !raw.starts_with('"') || !raw.ends_with('"') {
        return raw.to_owned();
    }
    let body = &raw[1..raw.len() - 1];
    let body_bytes = body.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(body.len());
    let mut index = 0usize;
    while index < body_bytes.len() {
        if body_bytes[index] == b'\\' && index + 1 < body_bytes.len() {
            // Up to 3 octal digits (`0`..=`7`).
            let mut octal_len = 0usize;
            let mut octal_val: u32 = 0;
            while octal_len < 3 && index + 1 + octal_len < body_bytes.len() {
                let b = body_bytes[index + 1 + octal_len];
                if (b'0'..=b'7').contains(&b) {
                    octal_val = octal_val * 8 + u32::from(b - b'0');
                    octal_len += 1;
                } else {
                    break;
                }
            }
            if octal_len > 0 {
                out.push((octal_val & 0xFF) as u8);
                index += 1 + octal_len;
                continue;
            }
            // Escaped character: inspect the next UTF-8 scalar after `\`.
            let rest = &body[index + 1..];
            if let Some(next_ch) = rest.chars().next() {
                match next_ch {
                    'n' => out.push(b'\n'),
                    'r' => out.push(b'\r'),
                    't' => out.push(b'\t'),
                    '"' => out.push(b'"'),
                    '\\' => out.push(b'\\'),
                    other => {
                        let mut buf = [0u8; 4];
                        out.extend_from_slice(other.encode_utf8(&mut buf).as_bytes());
                    }
                }
                index += 1 + next_ch.len_utf8();
                continue;
            }
        }
        out.push(body_bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// True when git auto-wired a new worktree branch's upstream to its fork
/// start-point (`origin/master`) instead of a same-named remote branch.
#[must_use]
pub fn is_inherited_start_point_upstream(
    branch: &str,
    tracking: &str,
    poracode_source: Option<&str>,
) -> bool {
    let Some(source) = poracode_source else {
        return false;
    };
    if branch.is_empty() || tracking.is_empty() || source.is_empty() || tracking != source {
        return false;
    }
    let Some(slash) = tracking.find('/') else {
        return false;
    };
    if slash == 0 {
        return false;
    }
    &tracking[slash + 1..] != branch
}

/// Strip `#` comment lines and surrounding whitespace from a Git `MERGE_MSG`.
#[must_use]
pub fn strip_commit_message_comments(message: &str) -> String {
    let mut kept = Vec::new();
    for line in message.split('\n') {
        let trimmed_start = line.trim_start();
        if trimmed_start.starts_with('#') {
            continue;
        }
        kept.push(line);
    }
    kept.join("\n").trim().to_owned()
}

/// Parse `git status --porcelain=v2 -b` output into structured entries.
#[must_use]
pub fn parse_status_porcelain_v2(output: &str) -> ParsedPorcelainStatus {
    let mut branch = String::new();
    let mut head_sha = String::new();
    let mut tracking = String::new();
    let mut ahead = 0usize;
    let mut behind = 0usize;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut conflict_files = Vec::new();
    let mut merge_in_progress = false;

    for raw_line in output.lines() {
        let line = raw_line.trim_end();
        if line.is_empty() {
            continue;
        }

        if let Some(header) = line.strip_prefix("# ") {
            if let Some(oid) = header.strip_prefix("branch.oid ") {
                head_sha = oid.trim().to_owned();
            } else if let Some(head) = header.strip_prefix("branch.head ") {
                branch = head.trim().to_owned();
            } else if let Some(up) = header.strip_prefix("branch.upstream ") {
                tracking = up.trim().to_owned();
            } else if let Some(ab) = header.strip_prefix("branch.ab ") {
                if let Some((plus_part, minus_part)) = ab.split_once(' ')
                    && let Some(a_str) = plus_part.strip_prefix('+')
                    && let Some(b_str) = minus_part.strip_prefix('-')
                    && !a_str.is_empty()
                    && !b_str.is_empty()
                    && a_str.bytes().all(|b| b.is_ascii_digit())
                    && b_str.bytes().all(|b| b.is_ascii_digit())
                {
                    ahead = a_str.parse::<usize>().unwrap_or(0);
                    behind = b_str.parse::<usize>().unwrap_or(0);
                } else {
                    ahead = 0;
                    behind = 0;
                }
            }
            continue;
        }

        if line.starts_with("u ") {
            merge_in_progress = true;
            let raw_path = nth_space_tail(line, 10);
            let path = to_forward_slash(&unquote_git_path(raw_path));
            conflict_files.push(path);
            continue;
        }

        if let Some(untracked_raw) = line.strip_prefix("? ") {
            unstaged.push(GitFileChange {
                path: to_forward_slash(&unquote_git_path(untracked_raw)),
                old_path: None,
                status: "?".to_owned(),
                staged: false,
                insertions: 0,
                deletions: 0,
            });
            continue;
        }

        let first_byte = line.as_bytes().first().copied().unwrap_or(0);
        if first_byte != b'1' && first_byte != b'2' {
            continue;
        }

        let (first_tab_part, second_tab_part) = match line.split_once('\t') {
            Some((left, right)) => (left, Some(right)),
            None => (line, None),
        };

        let mut space_iter = first_tab_part.split(' ');
        let _kind = space_iter.next();
        let Some(xy) = space_iter.next() else {
            continue;
        };
        let mut xy_chars = xy.chars();
        let Some(index_status) = xy_chars.next() else {
            continue;
        };
        let Some(worktree_status) = xy_chars.next() else {
            continue;
        };

        let skip_fields = if first_byte == b'2' { 9 } else { 8 };
        let raw_path = nth_space_tail(first_tab_part, skip_fields);
        let path = to_forward_slash(&unquote_git_path(raw_path));
        let old_path = if first_byte == b'2' {
            let decoded = to_forward_slash(&unquote_git_path(second_tab_part.unwrap_or("")));
            if decoded.is_empty() {
                None
            } else {
                Some(decoded)
            }
        } else {
            None
        };

        if index_status != '.' {
            staged.push(GitFileChange {
                path: path.clone(),
                old_path: old_path.clone(),
                status: index_status.to_string(),
                staged: true,
                insertions: 0,
                deletions: 0,
            });
        }
        if worktree_status != '.' {
            unstaged.push(GitFileChange {
                path,
                old_path,
                status: worktree_status.to_string(),
                staged: false,
                insertions: 0,
                deletions: 0,
            });
        }
    }

    ParsedPorcelainStatus {
        branch,
        head_sha,
        tracking,
        ahead,
        behind,
        staged,
        unstaged,
        conflict_files,
        merge_in_progress,
    }
}

/// Equivalent to `s.split(' ').slice(n).join(' ')` in JavaScript.
fn nth_space_tail(s: &str, n: usize) -> &str {
    if n == 0 {
        return s;
    }
    let bytes = s.as_bytes();
    let mut spaces_seen = 0usize;
    for (idx, &b) in bytes.iter().enumerate() {
        if b == b' ' {
            spaces_seen += 1;
            if spaces_seen == n {
                return &s[idx + 1..];
            }
        }
    }
    ""
}

fn collapse_repeated_slashes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut prev_slash = false;
    for ch in input.chars() {
        if ch == '/' {
            if !prev_slash {
                result.push('/');
            }
            prev_slash = true;
        } else {
            prev_slash = false;
            result.push(ch);
        }
    }
    result
}

fn resolve_numstat_rename_path(raw_path: &str) -> String {
    if let Some(plain_arrow) = raw_path.find(" => ")
        && !raw_path.contains('{')
    {
        return unquote_git_path(&raw_path[plain_arrow + " => ".len()..]);
    }
    let decoded = unquote_git_path(raw_path);
    if let Some(brace_start) = decoded.find('{') {
        let after_open = &decoded[brace_start..];
        if let Some(rel_end) = after_open.find('}')
            && let Some(rel_arrow) = after_open.find(" => ")
            && rel_arrow < rel_end
        {
            let brace_end = brace_start + rel_end;
            let arrow = brace_start + rel_arrow;
            let prefix = &decoded[..brace_start];
            let suffix = &decoded[brace_end + 1..];
            let new_inner = &decoded[arrow + " => ".len()..brace_end];
            let combined = format!("{prefix}{new_inner}{suffix}");
            return collapse_repeated_slashes(&combined);
        }
    }
    decoded
}

/// Parse `git diff --numstat` output into insertion/deletion counts per destination path.
#[must_use]
pub fn parse_diff_numstat(output: &str) -> Vec<DiffStatEntry> {
    let mut entries = Vec::new();
    for line in output.trim().lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some((insertions_raw, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some((deletions_raw, raw_path)) = rest.split_once('\t') else {
            continue;
        };
        if raw_path.is_empty() {
            continue;
        }
        let insertions = insertions_raw.parse::<usize>().unwrap_or(0);
        let deletions = deletions_raw.parse::<usize>().unwrap_or(0);
        entries.push(DiffStatEntry {
            path: to_forward_slash(&resolve_numstat_rename_path(raw_path)),
            insertions,
            deletions,
        });
    }
    entries
}

fn apply_numstat_to_side(files: Vec<GitFileChange>, numstat: Option<&str>) -> Vec<GitFileChange> {
    let Some(numstat_output) = numstat else {
        return files;
    };
    let mut stats: HashMap<String, (usize, usize)> = HashMap::new();
    for entry in parse_diff_numstat(numstat_output) {
        stats.insert(entry.path, (entry.insertions, entry.deletions));
    }
    let mut result = Vec::with_capacity(files.len());
    for mut file in files {
        if file.status == "?" {
            result.push(file);
            continue;
        }
        if let Some(&(ins, del)) = stats.get(&file.path) {
            file.insertions = ins;
            file.deletions = del;
            result.push(file);
        }
    }
    result
}

/// Merge staged and unstaged `--numstat` counts into parsed porcelain entries,
/// pruning phantom stat-dirty rows that have no diff.
pub fn apply_numstat_counts(
    parsed: &mut ParsedPorcelainStatus,
    staged_numstat: Option<&str>,
    unstaged_numstat: Option<&str>,
) {
    let staged = std::mem::take(&mut parsed.staged);
    let unstaged = std::mem::take(&mut parsed.unstaged);
    parsed.staged = apply_numstat_to_side(staged, staged_numstat);
    parsed.unstaged = apply_numstat_to_side(unstaged, unstaged_numstat);
}

/// Sum insertions and deletions across staged and unstaged entries.
#[must_use]
pub fn sum_change_totals(parsed: &ParsedPorcelainStatus) -> (usize, usize) {
    let total_insertions = parsed
        .staged
        .iter()
        .chain(parsed.unstaged.iter())
        .map(|f| f.insertions)
        .sum();
    let total_deletions = parsed
        .staged
        .iter()
        .chain(parsed.unstaged.iter())
        .map(|f| f.deletions)
        .sum();
    (total_insertions, total_deletions)
}

/// Expand collapsed `? dir/` porcelain entries into one entry per untracked file
/// from NUL-separated `git ls-files --others --exclude-standard -z` output.
pub fn expand_untracked_entries(parsed: &mut ParsedPorcelainStatus, ls_files_output: &str) {
    if !parsed.unstaged.iter().any(|f| f.status == "?") {
        return;
    }
    let untracked_paths: Vec<String> = ls_files_output
        .split('\0')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(to_forward_slash)
        .collect();
    if untracked_paths.is_empty() {
        return;
    }
    parsed.unstaged.retain(|f| f.status != "?");
    parsed.unstaged.reserve(untracked_paths.len());
    for path in untracked_paths {
        parsed.unstaged.push(GitFileChange {
            path,
            old_path: None,
            status: "?".to_owned(),
            staged: false,
            insertions: 0,
            deletions: 0,
        });
    }
}

/// Check whether `git remote -v` output contains at least one non-empty line.
#[must_use]
pub fn has_remote_lines(remote_output: &str) -> bool {
    remote_output.trim().lines().any(|line| !line.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUOTED_CYRILLIC: &str = "\"\\321\\204\\320\\260\\320\\271\\320\\273.txt\"";
    const DECODED_CYRILLIC: &str = "файл.txt";

    #[test]
    fn inherited_start_point_upstream_matches_ts_rules() {
        assert!(is_inherited_start_point_upstream(
            "poracode/clever-falcon-2541f8a0",
            "origin/master",
            Some("origin/master")
        ));
        assert!(!is_inherited_start_point_upstream(
            "feature/x",
            "origin/feature/x",
            Some("origin/master")
        ));
        assert!(!is_inherited_start_point_upstream(
            "poracode/clever-falcon-2541f8a0",
            "origin/master",
            Some("origin/develop")
        ));
    }

    #[test]
    fn unquotes_octal_and_simple_escapes() {
        assert_eq!(unquote_git_path("\"\\321\\204\""), "ф");
        assert_eq!(unquote_git_path(QUOTED_CYRILLIC), DECODED_CYRILLIC);
        assert_eq!(unquote_git_path("\"a\\tb\""), "a\tb");
        assert_eq!(unquote_git_path("\"a\\nb\""), "a\nb");
        assert_eq!(unquote_git_path("\"a\\\"b.txt\""), "a\"b.txt");
        assert_eq!(unquote_git_path("\"a\\\\b.txt\""), "a\\b.txt");
        assert_eq!(unquote_git_path("src/plain.ts"), "src/plain.ts");
        assert_eq!(unquote_git_path("\""), "\"");
        assert_eq!(unquote_git_path("\"partial"), "\"partial");
    }

    #[test]
    fn parses_porcelain_headers_renames_conflicts_and_quotes() {
        let output = [
            "# branch.oid abc123",
            "# branch.head feature/x",
            "# branch.upstream origin/feature/x",
            "# branch.ab +3 -1",
            "1 M. N... 100644 100644 100644 aaa aaa src\\changed.ts",
            "1 MM N... 100644 100644 100644 ccc ccc src/both.ts",
            &format!(
                "2 R. N... 100644 100644 100644 aaa aaa R100 {QUOTED_CYRILLIC}\t\"\\320\\261.txt\""
            ),
            "u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts",
            "? new-untracked.txt",
        ]
        .join("\n");

        let parsed = parse_status_porcelain_v2(&output);
        assert_eq!(parsed.branch, "feature/x");
        assert_eq!(parsed.head_sha, "abc123");
        assert_eq!(parsed.tracking, "origin/feature/x");
        assert_eq!(parsed.ahead, 3);
        assert_eq!(parsed.behind, 1);
        assert!(parsed.merge_in_progress);
        assert_eq!(parsed.conflict_files, vec!["src/conflict.ts"]);
        assert_eq!(parsed.staged.len(), 3);
        assert_eq!(parsed.staged[0].path, "src/changed.ts");
        assert_eq!(parsed.staged[2].path, DECODED_CYRILLIC);
        assert_eq!(parsed.staged[2].old_path.as_deref(), Some("б.txt"));
        assert_eq!(parsed.unstaged.len(), 2);
    }

    #[test]
    fn parses_diff_numstat_including_renames_and_binaries() {
        assert_eq!(
            parse_diff_numstat("-\t-\tassets/logo.png"),
            vec![DiffStatEntry {
                path: "assets/logo.png".to_owned(),
                insertions: 0,
                deletions: 0,
            }]
        );
        assert_eq!(
            parse_diff_numstat("1\t0\tsrc/{a => b}/file.txt"),
            vec![DiffStatEntry {
                path: "src/b/file.txt".to_owned(),
                insertions: 1,
                deletions: 0,
            }]
        );
        assert_eq!(
            parse_diff_numstat("2\t1\tdir/{ => sub}/file.txt"),
            vec![DiffStatEntry {
                path: "dir/sub/file.txt".to_owned(),
                insertions: 2,
                deletions: 1,
            }]
        );
        assert_eq!(
            parse_diff_numstat("2\t1\tdir/{sub => }/file.txt"),
            vec![DiffStatEntry {
                path: "dir/file.txt".to_owned(),
                insertions: 2,
                deletions: 1,
            }]
        );
        assert_eq!(
            parse_diff_numstat(&format!("4\t2\t\"\\320\\261.txt\" => {QUOTED_CYRILLIC}")),
            vec![DiffStatEntry {
                path: DECODED_CYRILLIC.to_owned(),
                insertions: 4,
                deletions: 2,
            }]
        );
    }

    #[test]
    fn prunes_phantom_rows_and_expands_untracked() {
        let mut parsed = parse_status_porcelain_v2(
            &[
                "# branch.head main",
                "1 .M N... 100644 100644 100644 ccc ccc src/phantom.ts",
                "1 .M N... 100644 100644 100644 ddd ddd src/real.ts",
                "? src/new/",
            ]
            .join("\n"),
        );
        apply_numstat_counts(&mut parsed, Some(""), Some("2\t3\tsrc/real.ts"));
        expand_untracked_entries(&mut parsed, "src/new/a.ts\0src/new/b.ts\0");
        let paths: Vec<&str> = parsed.unstaged.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["src/real.ts", "src/new/a.ts", "src/new/b.ts"]);
        assert_eq!(sum_change_totals(&parsed), (2, 3));
    }
}
