---
name: apple-iphone-duo-design
description: Design, implement, or review iPhone Duo layouts across its outer and inner displays, folded poses, reserved regions, and vertical system bars.
---

# iPhone Duo design

Read [iPhone design](../apple-ios-design/SKILL.md) and
[Apple design foundations](../apple-hig-foundations/SKILL.md). iPhone Duo is
an iPhone form factor, not a separate operating system.

- Preserve functionality, selection, and unsaved work across outer and inner
  displays, resizing, rotation, and partial folds. Adapt to container geometry
  and traits rather than device-name checks or hard-coded display dimensions.
- Standard split views can adapt their columns to reserved regions. For custom
  layouts, account for active fold divisions and camera occlusions with the
  SDK's reserved-region APIs; consider `ArrangementView` when its layout fits.
  Do not place an arrangement view inside a split view, list, or scroll view
  where it can make content inaccessible. Check API availability and keep the
  existing supported-system fallback.
- Prefer system navigation and toolbar items with both titles and symbols so
  the system can place them horizontally, vertically, or in overflow. Custom
  bars do not automatically obtain those adaptations. Keep controls near the
  content they affect and avoid dramatic rearrangements around the fold.
- Inspect every affected screen, sheet, and popover on the outer and inner
  displays, fully open and partially folded, in relevant orientations. If a
  Duo simulator or device is unavailable, report that limitation; synthetic
  dimensions alone do not prove fold, camera, or vertical-bar behavior.

Sources: [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)
and [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo).
Visual references: [Notes open](https://developer.apple.com/tutorials/images/com.apple.HIG/designing-for-iphone-notes-sidebar-open~dark@2x.png),
[Notes partially folded](https://developer.apple.com/tutorials/images/com.apple.HIG/designing-for-iphone-notes-sidebar-folded~dark@2x.png),
[Mail outer display](https://developer.apple.com/tutorials/images/com.apple.HIG/designing-for-iphone-mail-compact~dark@2x.png),
and [Mail inner display](https://developer.apple.com/tutorials/images/com.apple.HIG/designing-for-iphone-mail-full~dark@2x.png).
