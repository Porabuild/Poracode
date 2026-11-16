import Foundation

enum ToolPresentationStrings {
  static var expanded: String { label("expanded") }
  static var collapsed: String { label("collapsed") }
  static func label(_ key: String) -> String {
    let fallback: String
    switch key {
    case "args": fallback = "Arguments"
    case "result": fallback = "Result"
    case "results": fallback = "Workflow results"
    case "output": fallback = "Output"
    case "command": fallback = "Command"
    case "changes": fallback = "Changes"
    case "content": fallback = "Content"
    case "error": fallback = "Error"
    case "run": fallback = "Run"
    case "edit": fallback = "Edit"
    case "create": fallback = "Create"
    case "delete": fallback = "Delete"
    case "search": fallback = "Search"
    case "view": fallback = "View"
    case "list": fallback = "List"
    case "check": fallback = "Check"
    case "git": fallback = "Git"
    case "format-files": fallback = "Format files"
    case "package-manager": fallback = "Package manager"
    case "install-packages": fallback = "Install packages"
    case "list-packages": fallback = "List packages"
    case "package-config": fallback = "Package config"
    case "expanded": fallback = "Expanded"
    case "collapsed": fallback = "Collapsed"
    default: fallback = key
    }
    return NSLocalizedString("toolPresentation.\(key)", tableName: "ToolPresentation", bundle: .main,
      value: fallback, comment: "Canonical tool presentation label")
  }
  static func search(_ query: String, in scope: String) -> String {
    let format = NSLocalizedString("toolPresentation.searchIn", tableName: "ToolPresentation", bundle: .main,
      value: "Search: \"%1$@\" in %2$@", comment: "Command search query and scope")
    return String(format: format, query, scope)
  }
}
