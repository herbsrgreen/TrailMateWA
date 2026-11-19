import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import trails from "../data/trails.json";
import { getTrailRouteGeometry } from "../data/trailRoutes";
import "./Map.css";

const WESTERN_AUSTRALIA_CENTER = [115.86, -31.951];
const CAR_DISTANCE_SOURCE_ID = "car-distance";
const CAR_DISTANCE_LAYER_ID = "car-distance-line";
const MTB_TRAILS_SOURCE_ID = "mtb-trails";
const MTB_TRAILS_LAYER_ID = "mtb-trails-line";
const MTB_TRAIL_LABELS_LAYER_ID = "mtb-trail-labels";
const RIDE_BREADCRUMB_SOURCE_ID = "ride-breadcrumbs";
const RIDE_BREADCRUMB_LAYER_ID = "ride-breadcrumbs-line";
const RIDE_BREADCRUMB_COLOR = "#ff3030";
const CURRENT_LOCATION_ARROW_PATH = "M20 2L36 38 20 29 4 38Z";
const TRAILHEAD_PIN_PATH =
  "M50 4C24 4 5 23 5 49c0 30 45 58 45 58s45-28 45-58C95 23 76 4 50 4Z";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

setWorkerUrl(mapLibreWorkerUrl);

function getTrailheadColor(difficulty) {
  switch (difficulty) {
    case "Easy":
      return "#2e9d45";
    case "Moderate":
    case "Blue":
    case "Intermediate":
      return "#2878d0";
    case "Difficult":
    case "Advanced":
      return "#111111";
    default:
      return "#808080";
  }
}

function getDifficultyColorExpression() {
  return [
    "match",
    ["get", "difficulty"],
    "Easy",
    "#2e9d45",
    "Moderate",
    "#2878d0",
    "Blue",
    "#2878d0",
    "Intermediate",
    "#2878d0",
    "Difficult",
    "#111111",
    "Advanced",
    "#111111",
    "Unrated",
    "#808080",
    "#808080",
  ];
}

function updateConnectionLine(map, coordinates, savedCarLocation) {
  const source = map.getSource(CAR_DISTANCE_SOURCE_ID);
  if (!source || typeof source.setData !== "function") return;

  const hasBothLocations = coordinates && savedCarLocation;
  source.setData({
    type: "FeatureCollection",
    features: hasBothLocations
      ? [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [coordinates.longitude, coordinates.latitude],
                [savedCarLocation.longitude, savedCarLocation.latitude],
              ],
            },
            properties: {},
          },
        ]
      : [],
  });
}

function getRideBreadcrumbsGeoJson(points) {
  const coordinates = points.map(({ latitude, longitude }) => [
    longitude,
    latitude,
  ]);
  return {
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates },
              properties: {},
            },
          ]
        : [],
  };
}

function updateRideBreadcrumbs(map, points) {
  const source = map.getSource(RIDE_BREADCRUMB_SOURCE_ID);
  if (!source || typeof source.setData !== "function") return;

  source.setData(getRideBreadcrumbsGeoJson(points));
}

function createCurrentLocationArrowElement() {
  const element = document.createElement("div");
  element.className = "user-location-marker";
  element.style.width = "36px";
  element.style.height = "36px";
  element.style.pointerEvents = "none";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Current GPS location");

  const arrow = document.createElementNS(SVG_NAMESPACE, "svg");
  arrow.classList.add("user-location-arrow");
  arrow.setAttribute("viewBox", "0 0 40 40");
  arrow.setAttribute("width", "36");
  arrow.setAttribute("height", "36");
  arrow.style.transformOrigin = "center";
  arrow.style.filter = "drop-shadow(0 1px 2px rgb(0 0 0 / 50%))";
  arrow.style.display = "none";

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", CURRENT_LOCATION_ARROW_PATH);
  path.setAttribute("fill", "#168bff");
  path.setAttribute("stroke", "#ffffff");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linejoin", "round");

  arrow.append(path);
  const dot = document.createElement("span");
  dot.className = "current-location-dot";
  dot.setAttribute("aria-hidden", "true");
  element.append(dot, arrow);

  return { element, arrow, dot };
}

function fitToTrail(map, trailId) {
  const trail = trails.find((feature) => feature.id === trailId);
  if (!trail) return;

  if (trail.route) {
    const geometry = getTrailRouteGeometry(trail.route);
    const coordinates =
      geometry.type === "LineString"
        ? geometry.coordinates
        : geometry.coordinates.flat();
    const bounds = coordinates.reduce(
      (trailBounds, coordinate) => trailBounds.extend(coordinate),
      new LngLatBounds(),
    );
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    map.fitBounds(bounds, {
      padding: { top: 80, right: 20, bottom: 100, left: 20 },
      maxZoom: 15,
      duration: 800,
    });
    return;
  }

  const trailhead = trail.trailhead ?? trail;
  if (
    !Number.isFinite(trailhead.latitude) ||
    !Number.isFinite(trailhead.longitude)
  ) {
    return;
  }

  map.flyTo({
    center: [trailhead.longitude, trailhead.latitude],
    zoom: 14,
    padding: { top: 130, right: 32, bottom: 250, left: 32 },
    duration: 800,
  });
}

function getTrailsGeoJson() {
  return {
    type: "FeatureCollection",
    features: trails.flatMap((trail) => {
      const features = [];
      if (trail.route) {
        features.push({
          type: "Feature",
          properties: {
            id: trail.id,
            difficulty: trail.difficulty,
            label: "",
          },
          geometry: getTrailRouteGeometry(trail.route),
        });
      }

      const trailhead = trail.trailhead ?? (trail.route ? null : trail);
      if (
        trailhead &&
        Number.isFinite(trailhead.latitude) &&
        Number.isFinite(trailhead.longitude)
      ) {
        features.push({
          type: "Feature",
          properties: {
            id: trail.id,
            difficulty: trail.difficulty,
            label: `${trail.name} · ${trail.trailhead?.label ?? "Trailhead"}`,
          },
          geometry: {
            type: "Point",
            coordinates: [trailhead.longitude, trailhead.latitude],
          },
        });
      }

      return features;
    }),
  };
}

function addTrailInteractions(mapInstance, layerId, onTrailSelectRef) {
  mapInstance.on("click", layerId, (event) => {
    const trailId = event.features?.[0]?.properties?.id;
    if (typeof trailId === "string") {
      onTrailSelectRef.current(trailId);
    }
  });
  mapInstance.on("mouseenter", layerId, () => {
    mapInstance.getCanvas().style.cursor = "pointer";
  });
  mapInstance.on("mouseleave", layerId, () => {
    mapInstance.getCanvas().style.cursor = "";
  });
}

function createTrailheadMarkerElement(color, label, trailId, onTrailSelectRef) {
  const element = document.createElement("div");
  element.style.width = "50px";
  element.style.height = "60px";
  element.style.cursor = "pointer";
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", label);

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 100 110");
  svg.setAttribute("width", "50");
  svg.setAttribute("height", "60");

  const pin = document.createElementNS(SVG_NAMESPACE, "path");
  pin.setAttribute("d", TRAILHEAD_PIN_PATH);
  pin.setAttribute("fill", color);
  pin.setAttribute("stroke", "#ffffff");
  pin.setAttribute("stroke-width", "6");

  const center = document.createElementNS(SVG_NAMESPACE, "circle");
  center.setAttribute("cx", "50");
  center.setAttribute("cy", "47");
  center.setAttribute("r", "17");
  center.setAttribute("fill", "#ffffff");

  svg.append(pin, center);
  element.append(svg);

  const selectTrail = (event) => {
    event.stopPropagation();
    onTrailSelectRef.current(trailId);
  };
  element.addEventListener("click", selectTrail);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTrail(event);
    }
  });

  return element;
}

function setTrailheadMarkerSize(element, selected) {
  const width = selected ? 62 : 50;
  const height = selected ? 74 : 60;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  const svg = element.querySelector("svg");
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);
}

function Map({
  coordinates,
  savedCarLocation,
  isRecordingRide,
  selectedTrailId,
  onTrailSelect,
  ridePoints,
  deviceHeading,
  compassHeading,
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const currentLocationMarker = useRef(null);
  const currentLocationArrow = useRef(null);
  const carLocationMarker = useRef(null);
  const wasRecordingRide = useRef(false);
  const trailheadMarkers = useRef([]);
  const ridePointsRef = useRef(ridePoints);
  const locations = useRef({
    coordinates,
    savedCarLocation,
    isRecordingRide,
  });
  const onTrailSelectRef = useRef(onTrailSelect);
  const selectedTrailIdRef = useRef(selectedTrailId);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    onTrailSelectRef.current = onTrailSelect;
  }, [onTrailSelect]);

  useEffect(() => {
    ridePointsRef.current = ridePoints;
    if (map.current) {
      updateRideBreadcrumbs(map.current, ridePoints);
    }
  }, [ridePoints]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return undefined;
    const trailheadMarkerList = trailheadMarkers.current;

    const mapInstance = new MapLibreMap({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: WESTERN_AUSTRALIA_CENTER,
      zoom: 11,
    });

    mapInstance.addControl(new NavigationControl(), "top-right");
    mapInstance.on("error", (event) => {
      if (event.error) setMapError(event.error.message);
    });
    mapInstance.on("load", () => {
      let trailFeatures;
      try {
        trailFeatures = getTrailsGeoJson();
      } catch (error) {
        setMapError(`Unable to load trail routes: ${error.message}`);
        return;
      }

      mapInstance.addSource(MTB_TRAILS_SOURCE_ID, {
        type: "geojson",
        data: trailFeatures,
      });
      mapInstance.addLayer({
        id: MTB_TRAILS_LAYER_ID,
        type: "line",
        source: MTB_TRAILS_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "MultiLineString"],
        ],
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: selectedTrailIdRef.current ? "visible" : "none",
        },
        paint: {
          "line-color": getDifficultyColorExpression(),
          "line-width": [
            "case",
            ["==", ["get", "id"], selectedTrailIdRef.current],
            3,
            2,
          ],
          "line-opacity": 1,
        },
      });
      mapInstance.addSource(RIDE_BREADCRUMB_SOURCE_ID, {
        type: "geojson",
        data: getRideBreadcrumbsGeoJson(ridePointsRef.current),
      });
      mapInstance.addLayer({
        id: RIDE_BREADCRUMB_LAYER_ID,
        type: "line",
        source: RIDE_BREADCRUMB_SOURCE_ID,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": RIDE_BREADCRUMB_COLOR,
          "line-width": 6,
          "line-opacity": 0.95,
        },
      });
      trailFeatures.features.forEach((feature) => {
        if (feature.geometry.type !== "Point") return;

        const { id, difficulty, label } = feature.properties;
        if (typeof id !== "string") return;

        const element = createTrailheadMarkerElement(
          getTrailheadColor(difficulty),
          label,
          id,
          onTrailSelectRef,
        );
        element.style.display = selectedTrailIdRef.current ? "" : "none";
        setTrailheadMarkerSize(
          element,
          id === selectedTrailIdRef.current,
        );
        const marker = new Marker({ element, anchor: "bottom" })
          .setLngLat(feature.geometry.coordinates)
          .addTo(mapInstance);
        trailheadMarkerList.push([id, { marker, element }]);
      });
      mapInstance.addLayer({
        id: MTB_TRAIL_LABELS_LAYER_ID,
        type: "symbol",
        source: MTB_TRAILS_SOURCE_ID,
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["==", ["get", "id"], selectedTrailIdRef.current],
        ],
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 13,
          "text-anchor": "top",
          "text-offset": [0, 1.2],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          visibility: selectedTrailIdRef.current ? "visible" : "none",
        },
        paint: {
          "text-color": "#183b2c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
          "text-halo-blur": 0.5,
        },
      });
      addTrailInteractions(mapInstance, MTB_TRAILS_LAYER_ID, onTrailSelectRef);
      addTrailInteractions(
        mapInstance,
        MTB_TRAIL_LABELS_LAYER_ID,
        onTrailSelectRef,
      );
      mapInstance.addSource(CAR_DISTANCE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      mapInstance.addLayer({
        id: CAR_DISTANCE_LAYER_ID,
        type: "line",
        source: CAR_DISTANCE_SOURCE_ID,
        layout: {
          visibility: selectedTrailIdRef.current ? "visible" : "none",
        },
        paint: {
          "line-color": "#168bff",
          "line-width": 4,
          "line-opacity": 0.85,
        },
      });
      updateConnectionLine(
        mapInstance,
        locations.current.coordinates,
        locations.current.savedCarLocation,
      );
      if (locations.current.isRecordingRide && locations.current.coordinates) {
        const { latitude, longitude } = locations.current.coordinates;
        mapInstance.jumpTo({ center: [longitude, latitude], zoom: 17 });
      } else if (selectedTrailIdRef.current) {
        fitToTrail(mapInstance, selectedTrailIdRef.current);
      } else if (locations.current.coordinates) {
        const { latitude, longitude } = locations.current.coordinates;
        mapInstance.flyTo({ center: [longitude, latitude], zoom: 14 });
      }
    });
    map.current = mapInstance;

    return () => {
      currentLocationMarker.current?.remove();
      currentLocationMarker.current = null;
      currentLocationArrow.current = null;
      carLocationMarker.current?.remove();
      carLocationMarker.current = null;
      trailheadMarkerList.forEach(([, { marker }]) => marker.remove());
      trailheadMarkerList.length = 0;
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    selectedTrailIdRef.current = selectedTrailId;
    const mapInstance = map.current;
    if (!mapInstance || !mapInstance.getLayer(MTB_TRAILS_LAYER_ID)) return;

    mapInstance.setPaintProperty(MTB_TRAILS_LAYER_ID, "line-width", [
      "case",
      ["==", ["get", "id"], selectedTrailId],
      9,
      5,
    ]);
    mapInstance.setPaintProperty(
      MTB_TRAILS_LAYER_ID,
      "line-color",
      getDifficultyColorExpression(),
    );
    const trailVisibility = selectedTrailId ? "visible" : "none";
    mapInstance.setLayoutProperty(
      MTB_TRAILS_LAYER_ID,
      "visibility",
      trailVisibility,
    );
    mapInstance.setLayoutProperty(
      MTB_TRAIL_LABELS_LAYER_ID,
      "visibility",
      trailVisibility,
    );
    if (mapInstance.getLayer(CAR_DISTANCE_LAYER_ID)) {
      mapInstance.setLayoutProperty(
        CAR_DISTANCE_LAYER_ID,
        "visibility",
        trailVisibility,
      );
    }
    trailheadMarkers.current.forEach(([trailId, { element }]) => {
      element.style.display = selectedTrailId ? "" : "none";
      setTrailheadMarkerSize(element, trailId === selectedTrailId);
    });
    if (mapInstance.getLayer(MTB_TRAIL_LABELS_LAYER_ID)) {
      mapInstance.setFilter(MTB_TRAIL_LABELS_LAYER_ID, [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["==", ["get", "id"], selectedTrailId],
      ]);
    }
    if (selectedTrailId) {
      fitToTrail(mapInstance, selectedTrailId);
    }
  }, [selectedTrailId]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    if (coordinates) {
      const currentPosition = [coordinates.longitude, coordinates.latitude];
      if (isRecordingRide) {
        mapInstance.setCenter(currentPosition);
        if (!wasRecordingRide.current) {
          mapInstance.setZoom(17);
        }
        wasRecordingRide.current = true;
      } else {
        wasRecordingRide.current = false;
      }

      if (!isRecordingRide && !selectedTrailId) {
        mapInstance.flyTo({ center: currentPosition, zoom: 14 });
      }

      if (currentLocationMarker.current) {
        currentLocationMarker.current.setLngLat(currentPosition);
      } else {
        const { element, arrow, dot } = createCurrentLocationArrowElement();
        currentLocationMarker.current = new Marker({
          element,
          anchor: "center",
        })
          .setLngLat(currentPosition)
          .addTo(mapInstance);
        currentLocationArrow.current = { arrow, dot, element };
      }

      if (currentLocationArrow.current) {
        const heading = Number.isFinite(deviceHeading)
          ? deviceHeading
          : compassHeading;
        const { arrow, dot, element } = currentLocationArrow.current;
        const hasHeading = Number.isFinite(heading);
        console.info("[TrailMate] Applying location marker heading", {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          gpsHeading: deviceHeading,
          compassHeading,
          appliedHeading: hasHeading ? heading : null,
          arrowVisible: hasHeading,
        });
        arrow.style.display = hasHeading ? "block" : "none";
        dot.style.display = hasHeading ? "none" : "block";
        if (hasHeading) {
          arrow.style.transform = `rotate(${heading}deg)`;
          element.setAttribute(
            "aria-label",
            "Current GPS location and direction",
          );
        } else {
          element.setAttribute("aria-label", "Current GPS location");
        }
      }
    } else {
      if (!isRecordingRide) {
        wasRecordingRide.current = false;
      }
      currentLocationMarker.current?.remove();
      currentLocationMarker.current = null;
      currentLocationArrow.current = null;
    }

    if (!savedCarLocation || !selectedTrailId) {
      carLocationMarker.current?.remove();
      carLocationMarker.current = null;
      return;
    }

    const carPosition = [
      savedCarLocation.longitude,
      savedCarLocation.latitude,
    ];

    if (carLocationMarker.current) {
      carLocationMarker.current.setLngLat(carPosition);
    } else {
      const carIcon = document.createElement("div");
      carIcon.className = "car-map-marker";
      carIcon.textContent = "🚗";
      carIcon.setAttribute("role", "img");
      carIcon.setAttribute("aria-label", "Saved car location");
      carLocationMarker.current = new Marker({ element: carIcon })
        .setLngLat(carPosition)
        .addTo(mapInstance);
    }
  }, [
    coordinates,
    compassHeading,
    deviceHeading,
    isRecordingRide,
    savedCarLocation,
    selectedTrailId,
  ]);

  useEffect(() => {
    locations.current = { coordinates, savedCarLocation, isRecordingRide };
    if (map.current) {
      updateConnectionLine(map.current, coordinates, savedCarLocation);
    }
  }, [coordinates, isRecordingRide, savedCarLocation]);

  return (
    <div className="map-shell">
      <div
        className="map-container"
        ref={mapContainer}
        aria-label="Map of mountain bike trails in Western Australia"
      />
      {mapError && (
        <p className="map-error" role="alert">
          Map error: {mapError}
        </p>
      )}
    </div>
  );
}

export default Map;
