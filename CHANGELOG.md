# Changelog

All notable changes to this project will be documented in this file.

## [Released]

### Added
- **Export Settings Group:** Consolidate export format and filename input into a dedicated UI group within the header.
- **Resizing Gizmo Update:** The resizing gizmo (outline and handles) now respects individual `scaleX` and `scaleY` properties, ensuring the selection box accurately matches the image dimensions during non-uniform scaling.
- **Header Layout:** Restructured the header into distinct left, center, and right sections for better organization and responsiveness.
- **Styling Updates:**
    - Refined color palette with darker, richer tones (e.g., `#0c0c0e` background).
    - Updated fonts to 'Inter' for specific UI elements like inputs.
    - Added new CSS classes for header tools and export settings.

### Changed
- **Export Input Width:** Increased the width of the export filename input to `240px` to accommodate longer filenames.
- **Undo/Redo Positioning:** Removed absolute positioning from the Undo/Redo buttons (center header) to prevent overlap with other header elements on smaller screens.
- **Header Visuals:** improved contrast and visual hierarchy in the header.

### Fixed
- **Gizmo Scaling Bug:** Fixed an issue where the selection outline and resize handles would not match the actual size of the image when the image was resized non-uniformly (stretched).
- **Header Overlap:** Resolved an issue where the center tool buttons would overlap with the left-aligned export settings.
