/// Canonical roles shared by UIA, AX, and AT-SPI snapshots.
pub fn canonical_role(role: &str) -> String {
    let lower = role.trim().to_ascii_lowercase();
    let normalized: String = lower
        .strip_prefix("ax")
        .unwrap_or(&lower)
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect();
    let canonical = match normalized.as_str() {
        "textfield" | "textbox" | "textarea" | "entry" | "searchfield" | "searchbox" => "edit",
        "statictext" | "label" => "text",
        "pushbutton" => "button",
        "checkbutton" => "checkbox",
        "popupbutton" => "combobox",
        "frame" => "window",
        "scrollarea" | "scrollpane" | "panel" => "pane",
        "pagetab" | "tabitem" => "tab",
        "pagetablist" | "tabgroup" => "tablist",
        "outline" => "tree",
        "outlinerow" => "treeitem",
        "tablecell" => "cell",
        "tablerow" => "row",
        "columnheader" => "headeritem",
        "progressindicator" => "progressbar",
        "incrementor" | "spinbutton" => "spinner",
        "splitter" => "separator",
        "hyperlink" => "link",
        "" => "unknown",
        _ => &normalized,
    };
    canonical.to_string()
}

#[cfg(test)]
mod tests {
    use super::canonical_role;

    #[test]
    fn normalizes_platform_roles_without_merging_distinct_controls() {
        for (roles, expected) in [
            (vec!["button", "AXButton", "push button"], "button"),
            (vec!["edit", "AXTextField", "AXTextArea", "entry"], "edit"),
            (vec!["text", "AXStaticText", "label"], "text"),
            (vec!["tab", "AXTabItem", "page tab"], "tab"),
            (vec!["tree", "AXOutline", "tree"], "tree"),
        ] {
            for role in roles {
                assert_eq!(canonical_role(role), expected, "{role}");
            }
        }
        for role in [
            "document",
            "radiobutton",
            "switch",
            "splitbutton",
            "dialog",
            "group",
            "passwordtext",
        ] {
            assert_eq!(canonical_role(role), role);
        }
    }
}
