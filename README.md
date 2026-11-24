# Mega Tree Builder

A local Three.js visualizer and calculator for straight-strand mini and mega trees.

Use Node.js 22.18 or newer. Run `npm ci` and `npm run dev`. Vite prints the local URL. Use `npm test` to check the calculations or `npm run build` to generate a static site in `dist/`. The scene and its assets are served locally.

Drag to orbit, scroll to zoom, or right-drag to pan. The magnifier switches to an unlit close-up of the mounting strip. The build is saved in this browser. **Export build** downloads a text cut list and power estimate.

## Printable frame

**Print frame kit** uses the current tree dimensions and measured hardware. **Download cut sheet** gives the number of 10-foot EMT sticks, grouped fractional-inch cuts, and the cuts for each stick. The kit ZIP adds the printable STLs, numbered base drawing, and assembly guide. The stock plan assumes a 1/8-inch kerf and calls out any single-piece mast that needs longer stock.

The shared Manifold CAD model is in `src/frame/solids.ts`. It generates both the downloadable parts and the frame meshes in the Three.js preview. Run `npm run check:cad` to type-check it and `node scripts/frame-kit.js` to regenerate the standard kit. Fit-test an elbow with your conduit before printing the batch. The frame is a prototype without a measured load or wind rating.

## Calculation assumptions

- Tree height is the vertical distance between the anchor rings. Pixel pitch is measured along the sloping strip. The lit span is centered, with equal unused length at both ends.
- Strand count applies to the selected wrap. A partial wrap includes both edge strands. A full wrap divides the ring into equal intervals with one strand at the seam.
- Stock defaults match the supplied strip measurements. Fractional hole steps require a different hole pattern. Roll estimates assume continuous strips, matching hole positions on each cut, and the configured attachment allowance at each end.
- The optional star is counted independently. Its pixels use the same full-white current assumption as the tree.
- The initial budget is 900 W of 12 V DC output on 120 V AC input. Full-white load uses the specified current per node. The example 50 mA value can be replaced with a measurement or the rating of the specific string. The estimate covers pixel load at the supply's DC output.
- Very dense previews sample pixels to keep the scene interactive. Counts and cut lengths always use the full design.

The outdoor panorama is adapted from [Preller Drive by Greg Zaal, Poly Haven](https://polyhaven.com/a/preller_drive), released under CC0. The frame, strips, cables, pixels, topper, and lighting are generated in Three.js.

**Presets** opens with nine one-click builds for a 1,300-pixel inventory. Change the pixel count to recalculate the options. The planner uses complete 50-pixel strings on each vertical run. Set strings per run to two for a 100-pixel run. After reserving the star pixels, it caps the number of vertical runs at what fits the inventory. Remaining stock is shown as whole strings and loose pixels. The dimmer changes preview lighting; electrical figures always use full white. The 5′10″ figure has a custom face texture based on Wes’s portrait and uses the CC0 [Daniel standing model by Innerscene](https://www.innerscene.com/tools/library/3d-parts/daniel-3d-person-standing-casual-f788af5a).
