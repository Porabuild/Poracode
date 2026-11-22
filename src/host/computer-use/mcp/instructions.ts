import { uniqueCoreSkillForBuiltInMcp } from "@/shared/plugins/builtInCoreSkills";

/**
 * The Computer Use plugin's core skill, the one `@Computer Use` mentions.
 * Read from `plugin.json` so a rename there cannot leave initialize/api
 * pointing at a skill that no longer exists.
 */
export const COMPUTER_USE_CORE_SKILL = uniqueCoreSkillForBuiltInMcp("computer-use");

// Ordering is deliberate: the background-only rule comes before any mention of
// foreground mode. Detailed tree conventions, delivery.verified semantics, and
// platform scroll rules live in the core skill so sessions don't pay that prose
// tax before computer_use is actually used.
export const COMPUTER_USE_MCP_INSTRUCTIONS =
  `Use computer_use to inspect and control native Windows, macOS, or Linux apps. Before the first control action, load the ${COMPUTER_USE_CORE_SKILL} skill by name — it holds tree conventions, scrolling, and verification rules. These instructions are the contract for every tool result. ` +
  "Work in the background: Background is the only mode you may choose on your own. " +
  'mode:"foreground" and activate_window are takeovers; use them only when the user asked for a takeover, and tell them first. ' +
  "Never activate or raise a window to make an action land, and never alternate between background and foreground. " +
  "Start with list_apps or list_windows, then get_window_state (include_text:true, include_screenshot:false for semantic tasks); call api only when capability or permission details are needed. Prefer invoke_element or set_element_value over coordinates. " +
  "Call computer_use.enable before the first control action and computer_use.disable before pausing, waiting, or finishing. " +
  'Input tools use mode:"background" by default. Use perform for a short deterministic sequence of background actions and always read delivery or refused. ' +
  "A browser or Electron window ignores raw background mouse events; recover with find_elements plus invoke_element or set_element_value, or use the browser MCP server. That refusal is not a reason to take the window over. " +
  "If no background route can do the job, stop and ask the user for a takeover instead of taking one. " +
  "If locked, call enable once before inspection; if still screen_locked or a locked_use_ note, stop and ask the user to unlock. " +
  "The user's Prevent screen lock setting only stops idle locking; never change it yourself. " +
  "Prefer the browser MCP server for web pages. Secure prompts, permission prompts, and password surfaces require the user.";
