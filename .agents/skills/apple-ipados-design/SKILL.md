---
name: apple-ipados-design
description: Design, implement, or review native iPad interfaces, adaptive multi-column workspaces, inspectors, and resizable iPadOS windows using Apple's guidance.
---

# iPad design

Read [Apple design foundations](../apple-hig-foundations/SKILL.md). In Poracode,
also apply [mobile-apps](../mobile-apps/SKILL.md) and inspect desktop and
native-client counterparts before changing shared behavior.

- Use extra space to keep related content and navigation visible together;
  minimize disruptive modal transitions. Prefer a system split view and
  inspector when they satisfy the product's required sizing, state, and
  interaction behavior. Keep the selected item and its detail connected.
- An iPad sidebar can float above content using Liquid Glass; an inspector has
  a subtler, edge-to-edge relationship to its content. Prefer system materials
  and controls; do not cover a system-provided effect with a custom background.
  Keep content cards and data readable rather than turning every card to glass.
- Adapt to the current window's width and height, including intermediate sizes,
  multitasking, keyboard, portrait, and landscape. Do not use device identity
  or orientation as the sole sizing signal. Keep content, drafts, and panel
  selection available as columns collapse, resize, or reappear.
- Support touch first while retaining useful keyboard, pointer, and drag-and-
  drop interactions where the product needs them. Keep toolbar controls
  distinguishable and provide a way to reveal hidden panes.
- Compare equivalent desktop and iPad tasks with the same representative data.
  Record actual feature or data gaps instead of inserting placeholder content.
  Inspect wide and narrow windows, portrait and landscape, and relevant light,
  dark, accessibility, and keyboard states in a simulator or on a device.

Sources: [Designing for iPadOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados),
[Split views](https://developer.apple.com/design/human-interface-guidelines/split-views),
[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars),
[Windows](https://developer.apple.com/design/human-interface-guidelines/windows),
and [Apple's iPad design session](https://developer.apple.com/videos/play/wwdc2025/208/).
Visual references: [Landmarks sidebar on iPad](https://developer.apple.com/tutorials/images/com.apple.SwiftUI/Landmarks-Building-an-app-with-Liquid-Glass-2~dark@2x.png)
and [Apple's inspector example](https://developer.apple.com/videos/play/wwdc2025/323/?time=268).
