# Changelog

All notable changes to this project will be documented in this file.


## [0.3.0] - 2026-01-05

### Added
- **High DPI Support:** Implemented native resolution rendering for Retina/High-DPI displays for crisp text and vectors.
- **Pixel-Perfect Rendering:** Added logic to disable image smoothing and use pixelated rendering for DDS textures, ensuring sharp imports.
- **Canvas Resize Slider:** Added a zoom slider and input control to the right panel for precise view scaling.
- **Help Menu:** Added a keyboard shortcuts and help modal accessible via a '?' button in the header.
- **Layer Panel Scrolling:** Enabled independent scrolling for the layer list, handling large numbers of layers gracefully.

### Changed
- **UI Redesign:**
    - Increased global contrast with a darker 'Pro' theme (#050505 background).
    - Reorganized the Left Panel: Grouped "Layer Transform" and "Transform" controls separately.
    - Renamed "Mirror" controls to "Flip" for layer flipping, keeping "Linked Mirror" for transformations.
    - Moved Zoom controls to the bottom of the Right Panel.
- **Terminology:** Changed "Mirror" button labels to "Flip H/V" to better reflect their function.

## [0.2.0] - Previous


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
