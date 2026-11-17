<<<<<<< HEAD
# React + Vite

## Trail data

Trail records are stored in `src/data/trails.json` as an array, so more than
100 trails can be added without changing the UI structure. Each record includes
an `id`, `name`, `location`, `difficulty`, `distance` (kilometres),
`description`, and `photo` (a URL/path or `null` when no photo is available).
Optional `latitude` and `longitude` values display a marker when a trail has no
route. A `trailhead` object can provide `latitude`, `longitude`, and an optional
`label`; when present with a route, its marker is displayed alongside that route.
The selected marker is highlighted, labeled, and brought into view; route-backed
trails are highlighted and zoomed to their route.

### Trail route files

Routes live in `src/data/routes/` and are associated with a trail by its `route`
field in `trails.json`. To add a real route:

1. Copy the original GPX file into `src/data/routes/` and name it for the
   trail's route ID, for example `src/data/routes/chapman-river-loop.gpx`.
2. Set that trail's `route` field to the same ID, such as
   `"route": "chapman-river-loop"`.
3. Open the app and select the trail to verify that its route appears on the
   map. Invalid route data is reported as a map error.

The route loader automatically includes `.gpx` and `.geojson` files in this
folder. It reads GPX track segments (`trkseg`/`trkpt`), or GPX route points
(`rte`/`rtept` when there are no track segments), and converts their latitude
and longitude attributes to map coordinates. It also accepts GeoJSON
`LineString` or `MultiLineString` geometry, features, and feature collections;
GeoJSON coordinates use `[longitude, latitude]` order. Route coordinates are
validated when the map loads.

Leave `route` as `null` until a real route file is available. The trail remains
available in the list and details card, and its latitude/longitude or explicit
`trailhead` marker is still shown when provided. An explicit trailhead marker
can also be retained alongside an imported route. The route files in this
project were placeholders and have been removed rather than presented as real
trail data.

### Converting KML files

Run `node scripts/convert-kml-to-geojson.js [input-folder] [output-folder]` to
convert every `.kml` file in a folder. The defaults are `Dwellingup` and
`routes`, relative to the current directory. Each output keeps the source
filename with a `.geojson` extension; files that fail conversion are skipped
and listed in the summary.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
=======
# TrailMateWA
Mountain bike trail navigation app for Western Australia.
>>>>>>> c57fca232c18175209165a8677bf4c3252b614af
