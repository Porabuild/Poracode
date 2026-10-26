// poracode: keep the terminal wordmark in the central brand module.
import { BRAND } from "./brand"

export const logo = BRAND.wordmark

// poracode: PORA.CODE block art in the upstream glyph style for terminal epilogues.
export const art = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀█", "█__█ █__█ █__█ █__█", "█▀▀▀ ▀▀▀▀ ▀~▀█ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "█▀▀▀"],
}
