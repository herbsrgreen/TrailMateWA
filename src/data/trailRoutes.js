const routeFiles = import.meta.glob(
  ["./routes/*.{geojson,gpx}", "../../routes/*.{geojson,gpx}"],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);
const routeCache = new Map();

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

function normalizeLineGeometry(geometries) {
  const getLines = (geometry) => {
    if (geometry?.type === "LineString") return [geometry.coordinates];
    if (geometry?.type === "MultiLineString") return geometry.coordinates;
    if (
      geometry?.type === "GeometryCollection" &&
      Array.isArray(geometry.geometries)
    ) {
      return geometry.geometries.flatMap(getLines);
    }
    throw new Error("Trail route must contain line geometry.");
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
    throw new Error("Trail route contains invalid or incomplete coordinates.");
  }

  return lines.length === 1
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines };
}

function getGeoJsonLineGeometries(data) {
  if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data.features
      .filter((feature) => feature?.geometry)
      .map((feature) => feature.geometry);
  }
  if (data?.type === "Feature" && data.geometry) return [data.geometry];
  if (data?.type === "LineString" || data?.type === "MultiLineString") {
    return [data];
  }
  throw new Error("GeoJSON route must contain LineString features.");
}

function directChildren(element, childName) {
  return Array.from(element.children).filter(
    (child) => child.localName === childName,
  );
}

function readGpxPosition(point) {
  const longitude = Number(point.getAttribute("lon"));
  const latitude = Number(point.getAttribute("lat"));
  const position = [longitude, latitude];
  if (!isValidPosition(position)) {
    throw new Error("GPX route contains an invalid track point.");
  }
  return position;
}

function parseGpxRoute(source) {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("GPX route is not valid XML.");
  }

  const elements = Array.from(document.getElementsByTagName("*"));
  const trackSegments = elements.filter(
    (element) => element.localName === "trkseg",
  );
  const lines = trackSegments
    .map((segment) =>
      directChildren(segment, "trkpt").map(readGpxPosition),
    )
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    const routeElements = elements.filter(
      (element) => element.localName === "rte",
    );
    lines.push(
      ...routeElements
        .map((route) => directChildren(route, "rtept").map(readGpxPosition))
        .filter((line) => line.length > 0),
    );
  }

  return normalizeLineGeometry(
    lines.map((coordinates) => ({ type: "LineString", coordinates })),
  );
}

function loadRoute(routeId) {
  const filename = Object.keys(routeFiles).find((path) =>
    new RegExp(`/${routeId}\\.(geojson|gpx)$`, "i").test(path),
  );
  if (!filename) {
    throw new Error(`Route file not found for trail "${routeId}".`);
  }

  const source = routeFiles[filename];
  if (filename.toLowerCase().endsWith(".gpx")) {
    return parseGpxRoute(source);
  }

  let geoJson;
  try {
    geoJson = JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to parse route GeoJSON: ${error.message}`, {
      cause: error,
    });
  }
  return normalizeLineGeometry(getGeoJsonLineGeometries(geoJson));
}

export function getTrailRouteGeometry(routeId) {
  if (!routeId) return null;
  if (!routeCache.has(routeId)) {
    routeCache.set(routeId, loadRoute(routeId));
  }
  return routeCache.get(routeId);
}
