---
name: apple-hig-foundations
description: Apply Apple's shared Human Interface Guidelines when designing, implementing, or reviewing iPhone, iPad, or iPhone Duo interfaces. Use with the relevant device-specific Apple design skill.
---

# Apple design foundations

Use the relevant `apple-*-design` skill for platform-specific decisions. Read
the current Apple sources linked below when the task depends on a particular
control, OS release, or accessibility behavior. Follow explicit product
requirements and the repository's existing design system and deployment
targets; Apple's recommendations do not authorize unrelated redesigns.

- Identify the person's task, content, navigation, and input methods. Preserve
  selection, in-progress work, and access to the same functionality as the
  available space changes. Match shared behavior across clients while using
  each platform's own interaction patterns.
- Prefer system navigation, controls, semantic colors, typography, safe areas,
  and layout guides when they meet the product's requirements. Avoid fixed
  screen dimensions and custom appearances that obscure system effects.
- Liquid Glass is a functional layer for navigation and important controls;
  use standard materials or plain surfaces for content. Prefer system-provided
  glass and avoid overlapping glass effects. Use regular glass for text-rich
  navigation; clear glass is intended for controls over visually rich media.
  Respect OS availability and provide an appropriate fallback.
- Design for accessible labels and selection state, Dynamic Type, contrast,
  Reduce Transparency, Reduce Motion, localization and right-to-left layouts.
  Use appropriate target sizes for the platform and keep alternatives for
  gestures or pointer-only interactions.
- Inspect the real interface with representative content at the relevant window
  sizes, appearances, and accessibility settings. Verify interaction and
  state preservation, not just screenshots. Report simulator and device
  coverage accurately.

Sources: [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles),
[Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Materials](https://developer.apple.com/design/human-interface-guidelines/materials),
and [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).
