# Independent implementation approach

Forma implements the general workflows of a vector/UI design tool using original source, UI styling, and sample artwork. The starting behavioral requirements were informed by public descriptions of [design tools](https://help.figma.com/hc/en-us/articles/360041064174-Access-design-tools-from-the-toolbar), [frames](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design), and [groups versus frames](https://www.figma.com/best-practices/groups-versus-frames/).

The work is a behavioral reimplementation, not a decompilation or reverse engineering of proprietary internals. No Figma source, private API, binary, visual asset, or file-format parser is included. No other design-editor repository was cloned. The sample “Sundays” page is composed entirely from original editable shapes and text created for this repository.

The baseline scope translates public product behavior into independent requirements:

| Workflow | Forma implementation |
| --- | --- |
| Place and arrange shapes | Rust nodes, transforms, hit testing and stacking |
| Organize design screens | Nested frames with absolute coordinates |
| Edit properties | Inspector for geometry, typography and appearance |
| Recover from mistakes | Gesture transactions and bounded undo/redo |
| Keep and share work | Open JSON-based documents, SVG and PNG exports |

Figma-specific features and compatibility are not implied. Rust is compiled to the documented [`wasm32-unknown-unknown` target](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html). Rendering uses browser SVG; a GPU renderer is a possible future project, not a present capability.
