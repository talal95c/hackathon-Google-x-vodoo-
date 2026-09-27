# Creative universes — visual references and code credits

Explored via the [Three.js showcase](https://threejs.org/):

- [Claybound](https://claybound-56949.web.app/): chunky tactile silhouettes, warm clay surfaces and oversized scenery.
- [Tiny Skies](https://tinyskies.vercel.app/): miniature landscapes, playful scale and colour separation.
- [Three.js surface scattering example](https://threejs.org/examples/webgl_instancing_scatter.html): dense repeated details using surface sampling and instanced rendering.

These projects are visual references. Their artwork, models and proprietary site code are not included. The twenty landmark compositions, palettes and final colour grade are original procedural geometry/shaders in this repository.

## Reused Three.js code

Direct imports from the installed `three` package (MIT, copyright Three.js authors):

- `FilmPass` / `FilmShader`: animated film grain.
- `MeshSurfaceSampler`: seeded sampling of small garden islands, combined with `InstancedMesh`, following the official scatter example.
- `ImprovedNoise`: deformation of the low-poly landmark bases.
- `RoundedBoxGeometry` and `mergeGeometries`: rounded geometry and batching.
- Existing `EffectComposer`, `GTAOPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass` and `RoomEnvironment`: rendering pipeline, lighting and material environment.

[Upstream source and MIT licence](https://github.com/mrdoob/three.js). The full notice is in [`public/THREE-NOTICE.txt`](../public/THREE-NOTICE.txt) and ships in the itch.io build.

## Preview and verification

Run `npm run dev`, then open `/dev/universes.html`. Choose a universe and seed to inspect the actual streamed scene, toggle Film to compare the grade, or select **Preview ride** for an automatic tour using the real runner physics (obstacle damage is disabled in this preview). The preview uses the real seeded route, camera, models and postprocessing; it is not included in the production build.

`npm test` covers the seeded order, twenty sculpture footprints, road clearance, streamed geometry disposal, randomized tunnel profiles and portals beyond the fifth universe. Each race seed determines the same route for every player; the rendering RNG never consumes gameplay randomness.

## Route architecture

The five decks now have distinct analytic materials and geometry: taffy stripes and wafer layers, leaf veins and folded foliage, a curved ceramic bowl, piano keys with hanging resonators, and a magnetic deck inside helical rails. RoadProfiles changes actual elevation, width and curve radius using an independent seeded stream. The visible Poolside banks bounce both the player and solo rivals; a jump above the rim can still leave the deck.

Route tests raycast the running/jumping corridor over thousands of lane samples, verify continuity at section joins and ensure physics slopes match the visible road.
