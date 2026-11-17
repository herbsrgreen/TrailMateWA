import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const routesDirectory = path.join(projectDirectory, "routes");
const trailsFile = path.join(projectDirectory, "src", "data", "trails.json");
const temporaryTrailsFile = `${trailsFile}.tmp`;
const region = "Dwellingup";
const earthRadiusInMeters = 6371000;

function isValidPosition(position) {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}

function getLineGeometries(data) {
  let geometries;
  if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
    geometries = data.features
      .filter((feature) => feature?.geometry)
      .map((feature) => feature.geometry);
  } else if (data?.type === "Feature" && data.geometry) {
    geometries = [data.geometry];
  } else if (data?.type === "LineString" || data?.type === "MultiLineString") {
    geometries = [data];
  } else {
    throw new Error("GeoJSON must contain line geometry.");
  }

  const getLines = (geometry) => {
    if (geometry?.type === "LineString") return [geometry.coordinates];
    if (geometry?.type === "MultiLineString") return geometry.coordinates;
    if (
      geometry?.type === "GeometryCollection" &&
      Array.isArray(geometry.geometries)
    ) {
      return geometry.geometries.flatMap(getLines);
    }
    throw new Error("GeoJSON must contain line geometry.");
  };
  const lines = geometries.flatMap(getLines);

  if (
    lines.length === 0 ||
    lines.some(
      (line) =>
        !Array.isArray(line) ||
        line.length < 2 ||
        line.some((position) => !isValidPosition(position)),
    )
  ) {
    throw new Error("GeoJSON contains invalid or incomplete line coordinates.");
  }
  return lines;
}

function getDistanceInMeters(first, second) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(second[1] - first[1]);
  const longitudeDifference = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;
  const clampedHaversine = Math.min(1, haversine);

  return (
    earthRadiusInMeters *
    2 *
    Math.atan2(
      Math.sqrt(clampedHaversine),
      Math.sqrt(1 - clampedHaversine),
    )
  );
}

function getRouteDistanceInKilometers(lines) {
  const meters = lines.reduce(
    (total, line) =>
      total +
      line.slice(1).reduce(
        (lineTotal, position, index) =>
          lineTotal + getDistanceInMeters(line[index], position),
        0,
      ),
    0,
  );
  return Number((meters / 1000).toFixed(1));
}

function createTrailId(routeName) {
  const id = routeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) throw new Error(`Unable to create a trail ID from "${routeName}".`);
  return id;
}

async function generateTrailEntries() {
  const files = (await readdir(routesDirectory))
    .filter((file) => path.extname(file).toLowerCase() === ".geojson")
    .sort((first, second) => first.localeCompare(second));
  if (files.length === 0) {
    throw new Error(`No GeoJSON files found in ${routesDirectory}.`);
  }

  const generatedTrails = [];
  const ids = new Set();
  for (const file of files) {
    const routeName = path.basename(file, path.extname(file));
    const id = createTrailId(routeName);
    if (ids.has(id)) throw new Error(`Duplicate generated trail ID "${id}".`);
    ids.add(id);

    let data;
    try {
      data = JSON.parse(await readFile(path.join(routesDirectory, file), "utf8"));
    } catch (error) {
      throw new Error(`Unable to read GeoJSON file "${file}": ${error.message}`, {
        cause: error,
      });
    }

    const lines = getLineGeometries(data);
    generatedTrails.push({
      id,
      name: routeName,
      location: region,
      difficulty: "Unrated",
      distance: getRouteDistanceInKilometers(lines),
      description: `${routeName} mountain bike trail in ${region}.`,
      route: routeName,
    });
  }

  const trails = JSON.parse(await readFile(trailsFile, "utf8"));
  if (!Array.isArray(trails)) {
    throw new Error("trails.json must contain a JSON array.");
  }

  const previousRegionIndex = trails.findIndex(
    (trail) => trail.location === region,
  );
  const updatedTrails = trails.filter((trail) => trail.location !== region);
  updatedTrails.splice(
    previousRegionIndex === -1
      ? updatedTrails.length
      : Math.min(previousRegionIndex, updatedTrails.length),
    0,
    ...generatedTrails,
  );

  await writeFile(
    temporaryTrailsFile,
    `${JSON.stringify(updatedTrails, null, 2)}\n`,
  );
  await rename(temporaryTrailsFile, trailsFile);
  console.log(
    `Generated ${generatedTrails.length} ${region} trail entries in ${path.relative(projectDirectory, trailsFile)}.`,
  );
}

generateTrailEntries().catch((error) => {
  console.error(`Unable to generate trail entries: ${error.message}`);
  process.exitCode = 1;
});
