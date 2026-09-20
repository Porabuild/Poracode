import Foundation

/// Groups/filters transcript rows for UI while full raw history stays in session state.
///
/// Parity with desktop:
/// - `pending_request` never renders as a transcript row
/// - `parentItemId` children group under their parent (not top-level siblings)
/// - plan/goal are page-hidden on desktop; keep them out of the visible timeline
enum TranscriptPresentation {
    /// Desktop `RUNTIME_PAGE_HIDDEN_TYPES` plus children handled via grouping.
    static let hiddenTopLevelTypes: Set<String> = [
        "pending_request",
        "plan",
        "goal",
    ]

    struct Row: Sendable, Equatable, Identifiable {
        var item: PersistedRuntimeItem
        /// Child items that share this row's id as `parentItemId`, in source order.
        var children: [PersistedRuntimeItem]
        var id: String { item.id }
    }

    /// Visible top-level rows with nested children. Input may include hidden/raw items.
    static func visibleRows(from items: [PersistedRuntimeItem]) -> [Row] {
        var childrenByParent: [String: [PersistedRuntimeItem]] = [:]
        for item in items {
            guard let parent = item.parentItemId, !parent.isEmpty else { continue }
            childrenByParent[parent, default: []].append(item)
        }

        var rows: [Row] = []
        rows.reserveCapacity(items.count)
        for item in items {
            if item.parentItemId != nil { continue }
            if hiddenTopLevelTypes.contains(item.type) { continue }
            rows.append(
                Row(
                    item: item,
                    children: childrenByParent[item.id] ?? []
                )
            )
        }
        return rows
    }

    /// Flat list used by simple UI that still must not show pending_request / orphan children.
    static func visibleItems(from items: [PersistedRuntimeItem]) -> [PersistedRuntimeItem] {
        visibleRows(from: items).flatMap { row in
            [row.item] + row.children
        }
    }

    /// Whether a live/history item should be stored in the raw transcript buffer.
    /// pending_request is retained in raw history for hydration but filtered for UI.
    static func isPendingRequest(_ item: PersistedRuntimeItem) -> Bool {
        item.type == "pending_request"
    }
}
