# 🏎️ BeamNG Livery Studio

A professional-grade, browser-based livery creator specifically designed for **BeamNG.drive**. Create complex vehicle skins with vector precision, custom text, and pixel-perfect "Tattoo" layers directly in your browser.

## ✨ Key Features

*   **🎯 Vector Precision**: Create custom shapes and paths with professional-grade pen tools.
*   **🖋️ Dynamic Text**: Add text with live font switching and adjustable curvature (bending).
*   **🎨 Tattoo Layers**: Convert vectors and text into "Tattoo" layers—perfectly cropped raster objects that can be rotated, scaled, and recolored easily.
*   **🖌️ Pixel Painting**: Direct brush and eraser tools for fine detailing on paint layers.
*   **👁️ Smart Layer Management**: Visibility toggling, renaming, reordering, and locking/unlocking for a clean workflow.
*   **📦 DDS Native**: Built-in DDS decoding for importing standard BeamNG textures and exporting your finished livery.
*   **📖 Integrated Modding Guide**: Step-by-step instructions for PBR material setup and JBeam integration.

## 🚀 Quick Start

1.  Use the **Import** button to upload your vehicle's `.dds` template.
2.  Use the **Shape** or **Text** tools to build your design.
3.  Use **"Rasterize to Tattoo"** to turn complex elements into transformable, recolorable stickers.
4.  Export your final livery as a `.dds` file.
5.  Follow the **Guide** included in the studio to add it to your BeamNG mod folder!

## ⚠️ Troubleshooting: BC7 Format Errors

If you receive an "Unsupported Format" error when importing a `.dds` file:
*   **The Cause**: Modern BeamNG vehicles use **BC7 (DX10)** compression, which is not supported for direct browser decoding.
*   **The Fix**: You must convert the template to **DXT5 (BC3)** before importing. 
*   **How to fix**: Open the file in a tool like **Photopea** or **Photoshop**, and export it as a **DDS (DXT5/BC3)**.
*   **Unsupported List**: Check the **"Affected Vehicles"** list in the in-app **Guide** to see which vehicles require this conversion.

## 🛠️ Technology Stack

*   **Core**: HTML5, Vanilla JavaScript (ES6+)
*   **Graphics**: Canvas API (2D Context)
*   **DDS Decoding**: Custom binary parser for BC1, BC3, BC4, and BC5 formats.

---
*Created by [Your Name/Repo Holder]* 🏁
