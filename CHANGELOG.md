# Changelog

All notable changes to this project will be documented in this file.



## [0.4.0] - 2026-11-17

A rebuild of the editor on Fabric.js, with a new layout, BC7 support and templates straight from the game.

### Added
- **BC7 textures:** DDS files in BC7 (the format most current BeamNG skins and templates use) open directly; no more converting in Photopea first. Checked pixel for pixel against Pillow on the game's own skins.
- **Templates from your BeamNG install:** File › Open from your BeamNG install reads a vehicle's `.zip` from `content/vehicles/` in the browser and lists the game's own UV templates and the vehicle's existing skins, so every vehicle works, including ones newer than the included templates. UV templates open at the real skin size. Chrome and Edge can remember the vehicles folder.
- **Editing built on Fabric.js 7:** proper selection handles, multi-select, group / ungroup, align to the template, snapping to its centre and edges, arrow-key nudging, copy / cut / paste / duplicate.
- **Pen tool** with curves, and **point editing** for any shape or path (double-click or Enter).
- **Shapes:** 28 filled shapes (new: rounded rectangle, starburst, chevron, ring, stripe, racing slash), drawn by dragging, with outlines.
- **Text:** inline editing, 21 fonts including racing and display faces, outline, letter spacing, alignment, and a Curve slider that bends text along an arc.
- **Brushes:** smooth, spray and dots, with size, opacity and softness; strokes collect in a paint layer.
- **Eraser** (selected layer or all layers), **fill bucket** with tolerance and a "template only" mode for filling panels, **eyedropper**.
- **Gradient fills** (linear with angle and balance, or radial) on any shape or text, or dragged across the texture.
- **Linked mirrors** that follow position, size, rotation and style changes in both directions.
- **Picture adjustments:** hue, saturation, brightness and tint on images and rasterized layers.
- **Layers panel:** thumbnails, show / hide, lock, rename, drag to reorder; template opacity and "template on top" (drawn over the artwork, not exported).
- **Projects and autosave:** File › Save project writes a `.livery.json`; the studio also autosaves in the browser and restores the last session.
- **Export dialog:** DDS or PNG, with or without the template and hidden layers.
- Drag and drop or paste images, DDS files, projects and vehicle zips.

### Changed
- New layout: menu bar, a tool options bar, a slim toolbar with colour swatches, Properties and Layers on the right, a status bar, and a template chooser with search.
- The modding guide is rewritten for the current game: templates from the install, the `skinName` jbeam format the game's own skins use, copying a vehicle's own material, BC7 conversion for smaller files, and troubleshooting.

### Removed
- The BC7 "unsupported format" error and the conversion instructions it pointed to.
- The old hand-written canvas editor (`script.js`).

## [0.3.5] - 2026-01-05

### Added
- **Gradient Tool:** Implemented a robust Gradient Tool that allows creating resized Linear and Radial gradient boxes.
- **Gradient Settings:** Added controls for Gradient Type (Linear/Radial), Angle (0-360°), Balance (Color weighting), and **Curve (Bending)**.
- **Blend Modes:** Added support for 16 layer blend modes (Multiply, Screen, Overlay, etc.) with a new dropdown control in the Layer Properties panel.
- **Hybrid Rendering:** Implemented specific rendering logic that smoothes images when zoomed out (preserving wireframe details) but switches to sharp pixels when zoomed in (for precise editing).

### Fixed
- **Layer Resizing:** Completely rewrote Gizmo resizing logic. Resizing now respects the anchor point (opposite corner stays fixed) instead of scaling from the center.
- **Rendering Issues:** Addressed blurriness on High DPI displays by enforcing stricter image smoothing controls during zoom operations.

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
