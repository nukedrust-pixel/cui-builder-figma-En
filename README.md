# Figma to Rust UI Exporter

![Screenshot](https://i.ibb.co/DHpQktTT/image.png)

A plugin for Figma that allows you to export UI designs into code for Rust games.

## Features

- Export UI designs from Figma into ready-to-use C# code for Rust
- Correct handling of constraints and element anchoring
- Support for core UI elements: frames, texts, vectors
- Automatic export and integration of images in PNG format
- Generation of complete functions for adding and removing UI

## Installation

### Local installation (for development)

1. Download or clone this repository
2. Open Figma and create a new project or open an existing one
3. Go to the menu **Plugins** -> **Development** -> **New Plugin...**
4. Select the option **Link existing plugin**
5. Specify the path to the `manifest.json` file from the downloaded repository

## Usage

### Design Preparation

1. **Use frames instead of groups**
   - All containers should be frames (Shift+A), not groups
   - Apply fills directly to the frame, not to nested rectangles

2. **Correctly name the root frame**
   - The root frame must be named exactly "Overlay" or "Hud" (case-sensitive)

3. **Set constraints properly**
   - Use constraints to define how elements scale and position
   - For horizontal: Left/Right/Center to anchor to edges, Scale to stretch width
   - For vertical: Top/Bottom/Center to anchor to edges, Scale to stretch height

4. **Prepare images and icons**
   - Images: add them as fill for elements
   - Icons: preferably use as a single vector shape (flatten) or PNG
   - All images will be automatically exported and included in the code

### UI Export

1. Select the root frame in Figma (must be named "Overlay" or "Hud")
2. Run the plugin via **Plugins** -> **Figma to Rust UI Exporter** -> **Export UI to Rust**
3. Enable or disable image export as needed
4. Click the "Export to Rust UI" button
5. Copy the generated code or download it as a .cs file
6. If images were exported, you can download them separately or as a ZIP archive

## Integration with Rust

The generated code includes:
- All necessary UI elements with correct anchors and sizes
- Embedded images in base64 format
- A `CreateUI` function to display the UI
- A `DestroyUI` function to remove the UI

To use in a Rust plugin:
1. Copy the code into your plugin’s C# file

## Troubleshooting

- **Export fails:** Check that the root frame is named "Overlay" or "Hud"
- **Elements misaligned in UI:** Double-check constraint settings
- **Missing icons:** Make sure they are properly prepared (vectors or PNG)
- **Images not exporting:** Ensure they are applied as fill to the element
- **Color issues:** Use standard colors in RGB or RGBA




## Translated By Nukedrust
