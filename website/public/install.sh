#!/bin/sh
# Install the Poracode CLI from a GitHub Release self-contained archive. Needs
# only sh, tar, sha256sum or shasum, and curl or wget: no Node, npm, registry
# access or compiler. The archive carries its own Node.
#
#   curl -fsSL https://poracode.com/install.sh | sh
#
# Environment:
#   PORACODE_CHANNEL           release train: stable (default) or nightly
#   PORACODE_VERSION           exact version to install (overrides the channel)
#   PORACODE_INSTALL_DIR       install prefix (default: ~/.poracode/server). Each
#                              version lives in <prefix>/releases/<version> and
#                              <prefix>/current points at the active one, the
#                              layout `poracode service` and `poracode upgrade`
#                              manage
#   PORACODE_BIN_DIR           where the `poracode` link goes (default: ~/.local/bin)
#   PORACODE_RELEASE_BASE_URL  mirror for releases/download (default: GitHub)
#   PORACODE_NO_MODIFY_PATH=1  never edit shell startup files
#   PORACODE_NO_TUI=1          skip downloading the terminal UI during install
#
# Profile data (projects, threads, settings) lives outside the prefix and is
# never touched by this script.
set -eu

fail() {
  printf '\nporacode install: %s\n' "$1" >&2
  exit 1
}

say() {
  printf '  %s\n' "$1" >&2
}

# Exit 44 on a 404 so callers can tell "no such asset" from a network failure.
fetch() {
  if command -v curl >/dev/null 2>&1; then
    status="$(curl -sSL -H "Accept: ${3:-*/*}" -w '%{http_code}' "$1" -o "$2")" || return 1
    case "$status" in
      2??|000) return 0 ;;
      404) return 44 ;;
      *) printf 'GET %s returned HTTP %s\n' "$1" "$status" >&2; return 1 ;;
    esac
  elif command -v wget >/dev/null 2>&1; then
    if wget -q --header="Accept: ${3:-*/*}" "$1" -O "$2" 2>/dev/null; then return 0; fi
    rm -f "$2"
    if wget --spider -S "$1" 2>&1 | grep -q 'HTTP/[0-9.]* 404'; then return 44; fi
    return 1
  else
    fail "curl or wget is required"
  fi
}

installed_version() {
  [ -f "$1/standalone.json" ] && [ -x "$1/bin/poracode" ] || return 1
  "$1/bin/poracode" --version </dev/null 2>/dev/null | tail -n 1
}

cleanup() {
  rm -rf "$tmp"
  if [ -n "$staging" ]; then rm -rf "$staging"; fi
}

# Append the PATH line to one shell profile; $line and $bin_dir are globals.
add_path_line() {
  mkdir -p "$(dirname "$1")"
  if ! grep -qxF "$line" "$1" 2>/dev/null; then
    printf '\n# Poracode CLI PATH v1\n%s\n' "$line" >> "$1"
    say "Added ${bin_dir} to PATH in $1"
  fi
}

main() {
  repo="Porabuild/Poracode"
  base_url="${PORACODE_RELEASE_BASE_URL:-https://github.com/${repo}/releases/download}"
  base_url="${base_url%/}"
  prefix="${PORACODE_INSTALL_DIR:-$HOME/.poracode/server}"
  bin_dir="${PORACODE_BIN_DIR:-$HOME/.local/bin}"
  channel="${PORACODE_CHANNEL:-stable}"
  version="${PORACODE_VERSION:-}"

  case "$prefix" in /*) ;; *) prefix="$(pwd -P)/$prefix" ;; esac
  case "$bin_dir" in /*) ;; *) bin_dir="$(pwd -P)/$bin_dir" ;; esac

  case "$(uname -s)" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) fail "unsupported operating system $(uname -s). On Windows, run: irm https://poracode.com/install.ps1 | iex" ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch="arm64" ;;
    x86_64 | amd64) arch="x64" ;;
    *) fail "unsupported architecture $(uname -m)" ;;
  esac
  # An x64 shell under Rosetta still gets the native Apple silicon build.
  if [ "$platform" = darwin ] && [ "$arch" = x64 ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    arch="arm64"
  fi
  if [ "$platform" = linux ] &&
    { ls /lib/ld-musl-* >/dev/null 2>&1 || ldd --version 2>&1 | grep -qi musl; }; then
    fail "musl-based Linux (such as Alpine) is not supported; use a glibc distribution or the container image"
  fi
  target="${platform}-${arch}"

  command -v tar >/dev/null 2>&1 || fail "tar is required"
  if command -v sha256sum >/dev/null 2>&1; then
    checksum() { sha256sum < "$1" | cut -d' ' -f1; }
  elif command -v shasum >/dev/null 2>&1; then
    checksum() { shasum -a 256 < "$1" | cut -d' ' -f1; }
  else
    fail "sha256sum or shasum is required"
  fi

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/poracode-install.XXXXXX")"
  staging=""
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  if [ -z "$version" ]; then
    say "Finding the latest ${channel} release..."
    case "$channel" in
      stable)
        # Only plain releases are marked latest; this github.com page is not
        # rate-limited like the API and never returns a nightly.
        fetch "https://github.com/${repo}/releases/latest" "$tmp/latest.json" application/json ||
          fail "could not reach GitHub to find the latest release; set PORACODE_VERSION"
        version="$(sed -n 's/.*"tag_name": *"v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' "$tmp/latest.json" | head -n 1)"
        ;;
      nightly)
        page=1
        while [ -z "$version" ] && [ "$page" -le 5 ]; do
          fetch "https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}" "$tmp/releases.json" ||
            fail "could not list releases (the GitHub API may be rate-limited); set PORACODE_VERSION"
          version="$(sed -n 's/.*"tag_name": *"v\([0-9][0-9.]*-nightly\.[0-9][0-9]*\)".*/\1/p' "$tmp/releases.json" | head -n 1)"
          grep -q '"tag_name"' "$tmp/releases.json" || break
          page=$((page + 1))
        done
        ;;
      *) fail "PORACODE_CHANNEL must be stable or nightly" ;;
    esac
    [ -n "$version" ] || fail "could not find a ${channel} release; set PORACODE_VERSION"
  fi
  case "$version" in
    v*) version="${version#v}" ;;
  esac
  printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' ||
    fail "invalid version '${version}'"

  archive="poracode-${version}-${target}.tar.gz"
  releases_dir="${prefix}/releases"
  release_dir="${releases_dir}/${version}"
  launcher_target="${prefix}/current/bin/poracode"

  if [ "$(installed_version "$release_dir" || true)" = "$version" ]; then
    say "Poracode ${version} is already installed."
  else
    say "Installing Poracode ${version} (${target})..."
    fetch_status=0
    fetch "${base_url}/v${version}/SHA256SUMS" "$tmp/SHA256SUMS" || fetch_status=$?
    if [ "$fetch_status" -eq 44 ]; then
      hint=""
      if [ -z "${PORACODE_VERSION:-}" ] && [ "$channel" = stable ]; then
        hint=" (try PORACODE_CHANNEL=nightly)"
      fi
      fail "release ${version} has no SHA256SUMS; releases before the one-line installer need the desktop app or a newer version${hint}"
    elif [ "$fetch_status" -ne 0 ]; then
      fail "could not download the release checksums from ${base_url}/v${version}/"
    fi
    expected="$(awk -v name="$archive" '$2 == name || $2 == ("*" name) { print $1; exit }' "$tmp/SHA256SUMS")"
    [ -n "$expected" ] || fail "release ${version} has no self-contained archive for ${target}"

    say "Downloading ${archive}..."
    fetch "${base_url}/v${version}/${archive}" "$tmp/${archive}" ||
      fail "could not download ${base_url}/v${version}/${archive}"
    say "Verifying the download..."
    actual="$(checksum "$tmp/${archive}")"
    [ "$actual" = "$expected" ] || fail "checksum mismatch for ${archive} (expected ${expected}, got ${actual})"

    # Untrusted bytes until proven otherwise: no absolute or parent paths, no links.
    tar -tzf "$tmp/${archive}" > "$tmp/members" || fail "${archive} is not a readable archive"
    if grep -E '^/|(^|/)\.\.(/|$)' "$tmp/members" >/dev/null 2>&1; then
      fail "${archive} contains a path outside the install directory"
    fi
    if tar -tvzf "$tmp/${archive}" | grep -E '^[lh]' >/dev/null 2>&1; then
      fail "${archive} contains a link entry"
    fi

    mkdir -p "$releases_dir"
    for stale in "$releases_dir"/.staging-*; do
      [ -e "$stale" ] && rm -rf "$stale"
    done
    staging="$(mktemp -d "${releases_dir}/.staging-XXXXXX")"
    say "Extracting..."
    tar -xzf "$tmp/${archive}" -C "$staging"
    grep -F "\"target\": \"${target}\"" "$staging/standalone.json" >/dev/null 2>&1 ||
      fail "${archive} is not a self-contained archive for ${target}"
    # Keep the runtime's own complaint: a missing system library is the usual
    # reason a verified archive still cannot execute on this machine.
    reported=""
    if [ -x "$staging/bin/poracode" ]; then
      reported="$("$staging/bin/poracode" --version </dev/null 2>"$tmp/version.stderr" | tail -n 1 || true)"
    fi
    if [ "$reported" != "$version" ]; then
      reason="$(head -n 3 "$tmp/version.stderr" 2>/dev/null || true)"
      case "$reason" in
        *libatomic.so*)
          reason="$reason
Install libatomic1 (Debian, Ubuntu: sudo apt-get install libatomic1; Fedora, RHEL: sudo dnf install libatomic), then run the installer again."
          ;;
      esac
      if [ -n "$reason" ]; then
        fail "the downloaded Poracode ${version} does not run on this machine:
$reason"
      fi
      fail "the downloaded Poracode ${version} does not run on this machine"
    fi
    if [ -e "$release_dir" ]; then
      mv "$release_dir" "${staging}.previous"
      rm -rf "${staging}.previous"
    fi
    mv "$staging" "$release_dir"
    staging=""
  fi

  if [ -d "${prefix}/current" ] && [ ! -L "${prefix}/current" ]; then
    fail "${prefix}/current is a directory, not a release link; move it aside and retry"
  fi
  ln -sfn "releases/${version}" "${prefix}/current"

  # Link the command, never replacing a `poracode` this installer does not own
  # (for example one registered by the desktop app or installed with npm).
  linked=0
  mkdir -p "$bin_dir"
  if [ -L "${bin_dir}/poracode" ] && [ "$(readlink "${bin_dir}/poracode")" = "$launcher_target" ]; then
    linked=1
  elif [ -e "${bin_dir}/poracode" ] || [ -L "${bin_dir}/poracode" ]; then
    say "Kept the existing ${bin_dir}/poracode, which this installer does not own."
    say "Run ${launcher_target} directly, or set PORACODE_BIN_DIR to another directory."
  else
    ln -s "$launcher_target" "${bin_dir}/poracode"
    linked=1
  fi

  path_note=""
  if [ "$linked" = 1 ]; then
    case ":${PATH}:" in
      *":${bin_dir}:"*) ;;
      *)
        if [ "${PORACODE_NO_MODIFY_PATH:-}" = 1 ]; then
          path_note="Add ${bin_dir} to your PATH to run poracode."
        else
          shell_name="$(basename "${SHELL:-sh}")"
          if [ "$bin_dir" = "$HOME/.local/bin" ]; then
            # The same line the desktop app writes, so neither duplicates it.
            posix_line='case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac'
            fish_line='fish_add_path --path --append "$HOME/.local/bin"'
          else
            posix_line="case \":\$PATH:\" in *\":${bin_dir}:\"*) ;; *) export PATH=\"\$PATH:${bin_dir}\" ;; esac"
            fish_line="fish_add_path --path --append \"${bin_dir}\""
          fi
          line=""
          edited=0
          case "$shell_name" in
            zsh)
              line="$posix_line"
              add_path_line "${ZDOTDIR:-$HOME}/.zshrc"
              edited=1
              ;;
            bash)
              line="$posix_line"
              login="$HOME/.bash_profile"
              for candidate in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
                if [ -f "$candidate" ]; then login="$candidate"; break; fi
              done
              add_path_line "$login"
              add_path_line "$HOME/.bashrc"
              edited=1
              ;;
            fish)
              line="$fish_line"
              add_path_line "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"
              edited=1
              ;;
          esac
          if [ "$edited" = 1 ]; then
            path_note="Open a new terminal (or add ${bin_dir} to PATH) to run poracode."
          else
            path_note="Add ${bin_dir} to your PATH to run poracode."
          fi
        fi
        ;;
    esac
  fi

  if [ -f "${prefix}/service-registration.json" ]; then
    say "A managed service uses this prefix; restart it to run ${version}:"
    say "  poracode service restart --prefix ${prefix}"
  fi

  # Fetch the terminal UI now, so the first `poracode` opens without a download.
  if [ "${PORACODE_NO_TUI:-}" != 1 ]; then
    "${release_dir}/bin/poracode" tui --prefetch </dev/null >/dev/null ||
      say "Could not download the terminal UI now; poracode downloads it on first run."
  fi

  printf '\n  Installed Poracode %s\n\n' "$version" >&2
  if [ -n "$path_note" ]; then say "$path_note"; fi
  say "poracode               open the terminal UI"
  say "poracode serve --open  start the server and open the web app"
  say "poracode up            use it from your other devices"
  say "poracode update        move to the newest release"
  say "poracode --help        all commands"
  printf '\n' >&2
}

main "$@"
