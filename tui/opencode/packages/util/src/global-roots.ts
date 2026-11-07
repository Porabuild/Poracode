import os from "os"
import path from "path"

const home = os.homedir()
// poracode: Isolate OpenCode state without changing XDG variables inherited by child processes.
const tuiHome = process.env.PORACODE_TUI_HOME
const data = tuiHome
  ? path.join(tuiHome, "data")
  : process.env.XDG_DATA_HOME || (home ? path.join(home, ".local", "share") : undefined)
const cache = tuiHome
  ? path.join(tuiHome, "cache")
  : process.env.XDG_CACHE_HOME || (home ? path.join(home, ".cache") : undefined)
const config = tuiHome
  ? path.join(tuiHome, "config")
  : process.env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : undefined)
const state = tuiHome
  ? path.join(tuiHome, "state")
  : process.env.XDG_STATE_HOME || (home ? path.join(home, ".local", "state") : undefined)

/** The XDG base directories that root opencode's global paths. */
export function roots(app: string) {
  return {
    data: tuiHome ? data! : path.join(data!, app),
    cache: tuiHome ? cache! : path.join(cache!, app),
    config: tuiHome ? config! : path.join(config!, app),
    state: tuiHome ? state! : path.join(state!, app),
    tmp: tuiHome ? path.join(tuiHome, "tmp") : path.join(os.tmpdir(), app),
  }
}
