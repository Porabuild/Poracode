# Poracode Locked Computer Use

Optional macOS component that lets a Poracode Computer Use turn unlock the
screen briefly while the Mac is locked. Poracode covers the display with an
opaque guard while it works and locks the screen again when it finishes.
Your password is never stored, read, or typed.

The component has three parts:

- `PoracodeLockedUse.bundle`: a SecurityAgent authorization plug-in
  (`com.poracode.locked-computer-use.plugin`, mechanism
  `PoracodeLockedUse:allow,privileged`).
- The authorization right `com.poracode.locked-computer-use.unlock`
  (`evaluate-mechanisms`, `tries` 1, not shared).
- A change to `system.login.screensaver`: our right goes first in its rule list,
  and `k-of-n` is 1. The stock `use-login-window-ui` entry remains unchanged,
  so the normal password unlock keeps working.

`system.login.console`, the login window, other authorization rights, and other
plug-in bundles such as `KandjiPassport.bundle` are never modified.

## How an unlock is decided

The plug-in denies by default. If the plug-in denies, macOS shows the normal
lock screen.

1. It reads the console user and connects to
   `/Library/Application Support/Poracode/LockedComputerUse/run/<uid>/helper.sock`.
   The connection and the reply share a 250 ms budget.
2. It verifies the process on the other end of the socket:
   - The process runs as the console user (`LOCAL_PEERCRED`).
   - Its code signature (checked through the `LOCAL_PEERTOKEN` audit token)
     satisfies
     `anchor apple generic and certificate leaf[subject.OU] = "<TEAM_ID>" and identifier "<HELPER_IDENTIFIER>"`.
   - It is signed with the hardened runtime.

   A build without a team ID denies every request (`unsigned_build`).

3. It sends `CONSUME 1` and accepts only an exact reply in the form
   `ALLOW 1 <64 lowercase hex> <mintedAtMs> <threadId>`. The approval must have
   been minted within the last 30 seconds and not in the future. The helper
   gives out each approval once.
4. It appends one line per evaluation to
   `/Library/Logs/Poracode/locked-computer-use.log`:
   `<UTC time> uid=<n> outcome=<allow|deny> reason=<token> approval=<first 8 hex|-> thread=<threadId|->`.
   If that line can't be written, the unlock is denied.

### Socket protocol v1

The plug-in and helper exchange newline-terminated ASCII lines. Each response
is at most 256 bytes.

| Direction        | Line                                                            |
| ---------------- | --------------------------------------------------------------- |
| plug-in → helper | `CONSUME 1`                                                     |
| helper → plug-in | `ALLOW 1 <approvalId:64 lowercase hex> <mintedAtMs> <threadId>` |
| helper → plug-in | `DENY 1 <reason>` (`reason` matches `[a-z_]{1,32}`)             |

`threadId` matches `[A-Za-z0-9_.:-]{1,128}`. Any other reply is denied.

## Install and uninstall

The Poracode desktop app runs the bundled installer after one administrator
prompt. To run it by hand from the app's resources directory:

```sh
cd "/Applications/Poracode.app/Contents/Resources/locked-computer-use"
sudo ./locked-computer-use-installer install --user "$(id -u)"
sudo ./locked-computer-use-installer uninstall
./locked-computer-use-installer status   # JSON; does not need root
```

Install:

1. Verifies the bundle signature (`codesign --verify --strict`).
2. Refuses with exit code 3 unless `system.login.screensaver` is the stock
   `class: rule` / `["use-login-window-ui"]` form. If our form is already
   installed, it reinstalls.
3. When the rule is the stock form, saves the exact
   `security authorizationdb read` output to
   `backups/system.login.screensaver.<UTC time>.plist` and copies it to
   `backups/original.plist`. A reinstall over our form keeps the existing
   `original.plist`.
4. Copies the bundle and writes our right.
5. Runs a pre-flight check: it evaluates our right alone and requires a quick
   plug-in denial.
6. Writes the combined screensaver rule and verifies it by reading it back.

If any step after the backup fails, the installer restores the backup, removes
our right and the bundle, and exits with code 4. If policy changes during the
installation, it preserves that policy and leaves the plug-in for IT recovery.
Unsupported future installer state is preserved; install and uninstall refuse
before changing anything.

Uninstall:

1. Checks the current rule still matches the installed transform of the backup;
   later MDM policy edits refuse removal and preserve the plug-in and policy.
2. Writes `backups/original.plist` back to `system.login.screensaver` and
   verifies the read-back rule.
3. Removes our right, the bundle, `run/`, and `state.json`.

It keeps `backups/` and the audit log.

Exit codes: 0 ok, 2 usage, 3 unsupported_rule, 4 verification_failed (rolled
back), 5 not_root, 6 not_installed.

Files:

| Path                                                              | Owner / mode                      |
| ----------------------------------------------------------------- | --------------------------------- |
| `/Library/Security/SecurityAgentPlugins/PoracodeLockedUse.bundle` | root:wheel, 0755 dirs, 0644 files |
| `/Library/Application Support/Poracode/LockedComputerUse/`        | root:wheel 0755                   |
| `…/backups/*.plist`                                               | root 0600                         |
| `…/state.json` (`schemaVersion` 1)                                | root 0644                         |
| `…/run/<uid>/` (helper socket directory)                          | console user, 0700                |
| `/Library/Logs/Poracode/locked-computer-use.log`                  | root 0644                         |

## Manual recovery

The plug-in can only add a way to unlock. If it fails, it denies, and the
password prompt still appears. Use these steps only if the lock screen
stops accepting your password.

### With SSH or another admin session

```sh
# Restore the screensaver rule (either form works)
sudo security authorizationdb write system.login.screensaver use-login-window-ui
# or, to restore the exact backup:
sudo security authorizationdb write system.login.screensaver \
  < "/Library/Application Support/Poracode/LockedComputerUse/backups/original.plist"

# Remove the Poracode right and plug-in
sudo security authorizationdb remove com.poracode.locked-computer-use.unlock
sudo rm -rf /Library/Security/SecurityAgentPlugins/PoracodeLockedUse.bundle
```

### Without SSH

Force a restart by holding the power button, then log in normally. Login uses
`system.login.console`, which Poracode never changes. After you log in, run the
SSH commands above in Terminal.

### Last resort: recoveryOS

If you can't log in at all, start up in recoveryOS and open Terminal. Then move
the authorization database aside, and macOS rebuilds the default rules on the
next boot:

```sh
mv /Volumes/Data/private/var/db/auth.db /Volumes/Data/private/var/db/auth.db.bak
```

The data volume may have a different name (for example
`/Volumes/Macintosh HD - Data`). This resets every customized authorization
right, including rules set by other vendors and MDM, so reapply those
afterwards.

## IT and MDM notes

- The installer refuses to change a screensaver rule that another product
  (for example an identity or SSO plug-in) has already customized. Poracode
  never merges its rule with another vendor's rule.
- To block the feature, manage `system.login.screensaver` from your MDM. A
  non-stock rule makes the installer exit with code 3. You can also remove
  the right and bundle with the recovery commands above.
- Audit trail: `/Library/Logs/Poracode/locked-computer-use.log` records every
  evaluation. Poracode also records each begin and end in
  `locked-use-audit.jsonl` in its computer-use state directory.
- The plug-in allows an unlock only for the console user's signed Poracode
  helper, only during an active Computer Use turn, and only once for each
  approval. Local keyboard or mouse input during a session locks the screen
  again immediately.
