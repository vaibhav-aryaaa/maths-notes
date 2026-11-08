# Task 68: Library Redesign Moodboard & Reference Guide

**Folder Path**: `docs/moodboard/`

## 1. Primary References Analyzed
- **GoodNotes (Library Grid & Cover System)**:
  - Frameless notebook covers where the artwork/grid thumbnail is the hero (rounded 10px rectangle with subtle inner outline).
  - Title (14px font-medium) and relative timestamp ("Edited 2 days ago") placed neatly beneath each cover without wrapping container cards or heavy borders.
  - Context action (`...`) revealed gently on hover at the top-right of the cover.
  - Left sidebar navigation structuring All Documents, Favorites, Trash, and a 2-level folder hierarchy.
- **Notability / CollaNote (Folders & Subject Organization)**:
  - Folders structured as a clear tree in the sidebar with badge item counts.
  - Compact folder pills/tiles at root level rather than massive notebook-sized cards that crowd the workspace.
- **Apple Notes & Bear (Typography & Restraint)**:
  - Editorial clarity with one single warm accent colour (Amber/Orange).
  - Warm neutrals for paper-like surfaces (`#FAF9F7` page, `#FFFFFF` card in light mode; `#0F0F10` page, `#161617` surface in dark mode).
  - Strict 3-level text hierarchy (Primary, Secondary, Tertiary) with zero random slate/stone blending.
  - Display editorial serif heading (Instrument Serif) paired cleanly with Inter body type.
- **Linear / Notion (Micro-interactions & Density)**:
  - 240px clean desktop sidebar with unified action button ("New notebook").
  - Subtle 2px active accent pill/border indicator, avoiding bright colored bubbles.
  - Global `/` search shortcut with clear hint.
  - Modal styling: compact 400px width, clean autofocus with pre-selected title, Enter-to-submit, Escape-to-close.

## 2. Design System Decisions for Task 68
- **Display Font**: `Instrument Serif` (Google Fonts, loaded specifically for page headings).
- **Body Font**: `Inter Variable` (already integrated).
- **Single Brand Accent**: Warm Amber (`#d97706` / `#f59e0b`).
- **Radii**: Exactly three scales: 6px (inputs, small buttons), 10px (cards, dropdowns), 14px (modals).
- **Motion**: 140ms ease-out targeted specifically to `opacity, transform, background-color` with `prefers-reduced-motion` safety.
