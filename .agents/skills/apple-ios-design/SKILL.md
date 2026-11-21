---
name: apple-ios-design
description: Design, implement, or review a native iPhone interface using Apple's iOS Human Interface Guidelines. Use the iPadOS or iPhone Duo skill as well when those form factors are in scope.
---

# iPhone design

Read [Apple design foundations](../apple-hig-foundations/SKILL.md). In Poracode,
also apply [mobile-apps](../mobile-apps/SKILL.md) and its iOS component rules.

- Prioritize the current task and content; keep secondary actions discoverable
  without crowding the small screen. Favor familiar native navigation, back
  gestures, context menus, and controls appropriate to touch.
- Keep frequent actions comfortably reachable when the device is held in one
  or both hands. Apple's general button guidance recommends a 44-by-44-point
  hit region; a visual glyph can be smaller than its interactive region.
- Adapt to the actual container and safe areas, rotation, keyboard, Dynamic
  Type, and light or dark appearance. Do not assume all iPhones or windows share
  one size. Preserve edits and navigation when geometry changes.
- Test the affected screens and sheets with meaningful content, including
  narrow and landscape sizes when relevant, keyboard presentation, and
  accessibility. Use [iPhone Duo design](../apple-iphone-duo-design/SKILL.md)
  for its additional fold and vertical-bar behavior.

Sources: [Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios),
[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures),
and [Virtual keyboards](https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards).
