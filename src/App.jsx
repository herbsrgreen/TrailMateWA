import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./App.css";
import CarLocationPanel from "./components/CarLocationPanel";
import Header from "./components/Header";
import RideRecorder from "./components/RideRecorder";
import trails from "./data/trails.json";

const TrailMap = lazy(() => import("./components/Map"));

const CAR_LOCATION_STORAGE_KEY = "trailmatewa-car-location";
const RIDE_HISTORY_STORAGE_KEY = "trailmatewa-ride-history";
const MAX_SAVED_RIDES = 20;
const MAX_RIDE_GPS_ACCURACY_METERS = 15;
const MIN_RIDE_POINT_DISTANCE_METERS = 5;
const STATIONARY_SPEED_METERS_PER_SECOND = 0.5;
const FEATURED_TRAIL_ID = "chapman-river-loop";
const trailsByFeatured = [...trails].sort(
  (firstTrail, secondTrail) =>
    Number(Boolean(secondTrail.featured)) -
    Number(Boolean(firstTrail.featured)),
);
const trailsByLocation = trailsByFeatured.reduce((groups, trail) => {
  const locationTrails = groups.get(trail.location) ?? [];
  locationTrails.push(trail);
  groups.set(trail.location, locationTrails);
  return groups;
}, new Map());

function loadStoredData() {
  try {
    const savedCarLocation = JSON.parse(
      localStorage.getItem(CAR_LOCATION_STORAGE_KEY) || "null",
    );
    const rideHistory = JSON.parse(
      localStorage.getItem(RIDE_HISTORY_STORAGE_KEY) || "[]",
    );

    if (
      savedCarLocation !== null &&
      (!Number.isFinite(savedCarLocation.latitude) ||
        !Number.isFinite(savedCarLocation.longitude))
    ) {
      throw new Error("The saved car location is not valid.");
    }

    if (
      !Array.isArray(rideHistory) ||
      rideHistory.some(
        (ride) =>
          !Number.isFinite(ride.durationSeconds) ||
          !Number.isFinite(ride.distanceMeters) ||
          typeof ride.completedAt !== "string",
      )
    ) {
      throw new Error("The saved ride history is not valid.");
    }

    return {
      savedCarLocation,
      rideHistory: rideHistory.slice(0, MAX_SAVED_RIDES),
      error: "",
    };
  } catch (error) {
    return {
      savedCarLocation: null,
      rideHistory: [],
      error: `Unable to load saved data: ${error.message}`,
    };
  }
}

function getDistanceInMeters(firstLocation, secondLocation) {
  const earthRadiusInMeters = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(
    secondLocation.latitude - firstLocation.latitude,
  );
  const longitudeDifference = toRadians(
    secondLocation.longitude - firstLocation.longitude,
  );
  const firstLatitude = toRadians(firstLocation.latitude);
  const secondLatitude = toRadians(secondLocation.latitude);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadiusInMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function getDeviceCompassHeading(event) {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + 360) % 360;
  }

  if (event.absolute && Number.isFinite(event.alpha)) {
    return (360 - event.alpha + 360) % 360;
  }

  return null;
}

function formatTrailLength(lengthInMeters) {
  return lengthInMeters >= 1000
    ? `${(lengthInMeters / 1000).toFixed(1)} km`
    : `${Math.round(lengthInMeters)} m`;
}

function getDifficultyLabel(difficulty) {
  return difficulty === "Difficult" ? "Advanced" : difficulty;
}

function App() {
  const [initialStoredData] = useState(loadStoredData);
  const [coordinates, setCoordinates] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [compassHeading, setCompassHeading] = useState(null);
  const [isDeviceHeadingEnabled, setIsDeviceHeadingEnabled] = useState(false);
  const [savedCarLocation, setSavedCarLocation] = useState(
    initialStoredData.savedCarLocation,
  );
  const [rideHistory, setRideHistory] = useState(initialStoredData.rideHistory);
  const [storageError, setStorageError] = useState(initialStoredData.error);
  const [showSavedCarLocation, setShowSavedCarLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [headingError, setHeadingError] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [currentPage, setCurrentPage] = useState("map");
  const [selectedTrailId, setSelectedTrailId] = useState(FEATURED_TRAIL_ID);
  const [isTrailCardExpanded, setIsTrailCardExpanded] = useState(false);
  const [showCarActions, setShowCarActions] = useState(false);
  const [isRecordingRide, setIsRecordingRide] = useState(false);
  const [rideStartedAt, setRideStartedAt] = useState(null);
  const [rideDurationSeconds, setRideDurationSeconds] = useState(
    initialStoredData.rideHistory[0]?.durationSeconds ?? 0,
  );
  const [rideDistanceMeters, setRideDistanceMeters] = useState(
    initialStoredData.rideHistory[0]?.distanceMeters ?? 0,
  );
  const [hasCompletedRide, setHasCompletedRide] = useState(
    initialStoredData.rideHistory.length > 0,
  );
  const [ridePoints, setRidePoints] = useState([]);
  const watchId = useRef(null);
  const previousRideCoordinates = useRef(null);
  const ridePointCount = useRef(0);
  const rideStartedAtRef = useRef(null);
  const rideDistanceMetersRef = useRef(0);
  const distanceFromCar =
    coordinates && savedCarLocation
      ? getDistanceInMeters(savedCarLocation, coordinates)
      : null;
  const selectedTrail = trails.find((trail) => trail.id === selectedTrailId);
  const selectedTrailLength = selectedTrail
    ? typeof selectedTrail.distance === "string"
      ? selectedTrail.distance
      : `~${formatTrailLength(selectedTrail.distance * 1000)}`
    : null;

  const selectTrail = (trailId) => {
    setSelectedTrailId(trailId);
    setIsTrailCardExpanded(false);
  };

  const persistStoredData = (key, value) => {
    if (initialStoredData.error) return initialStoredData.error;

    try {
      localStorage.setItem(key, JSON.stringify(value));
      return "";
    } catch (error) {
      return `Unable to save data in this browser: ${error.message}`;
    }
  };

  useEffect(() => {
    if (rideStartedAt === null) return undefined;

    const updateRideDuration = () => {
      setRideDurationSeconds(Math.floor((Date.now() - rideStartedAt) / 1000));
    };

    updateRideDuration();
    const intervalId = setInterval(updateRideDuration, 1000);
    return () => clearInterval(intervalId);
  }, [rideStartedAt]);

  useEffect(
    () => () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isDeviceHeadingEnabled) return undefined;

    const updateCompassHeading = (event) => {
      const heading = getDeviceCompassHeading(event);
      if (heading !== null) setCompassHeading(heading);
    };

    window.addEventListener("deviceorientation", updateCompassHeading);
    window.addEventListener(
      "deviceorientationabsolute",
      updateCompassHeading,
    );

    return () => {
      window.removeEventListener("deviceorientation", updateCompassHeading);
      window.removeEventListener(
        "deviceorientationabsolute",
        updateCompassHeading,
      );
    };
  }, [isDeviceHeadingEnabled]);

  const enableDeviceHeading = () => {
    const orientationApi = window.DeviceOrientationEvent;
    if (!orientationApi) return;

    setHeadingError("");
    if (typeof orientationApi.requestPermission !== "function") {
      setIsDeviceHeadingEnabled(true);
      return;
    }

    orientationApi
      .requestPermission()
      .then((permission) => {
        if (permission === "granted") {
          setIsDeviceHeadingEnabled(true);
        } else {
          setHeadingError(
            "Device heading permission was denied. Using GPS direction when available.",
          );
        }
      })
      .catch((error) => {
        setHeadingError(
          `Unable to access device heading: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  };

  const stopRide = () => {
    if (rideStartedAtRef.current !== null) {
      const durationSeconds = Math.floor(
        (Date.now() - rideStartedAtRef.current) / 1000,
      );
      const updatedRideHistory = [
        {
          durationSeconds,
          distanceMeters: rideDistanceMetersRef.current,
          completedAt: new Date().toISOString(),
        },
        ...rideHistory,
      ].slice(0, MAX_SAVED_RIDES);
      setRideDurationSeconds(durationSeconds);
      setHasCompletedRide(true);
      setRideHistory(updatedRideHistory);
      setStorageError(
        persistStoredData(RIDE_HISTORY_STORAGE_KEY, updatedRideHistory),
      );
    }

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    rideStartedAtRef.current = null;
    previousRideCoordinates.current = null;
    setRideStartedAt(null);
    setIsRecordingRide(false);
    setCurrentPage("ride");
  };

  const startRide = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }

    enableDeviceHeading();
    setLocationError("");
    setRideDistanceMeters(0);
    rideDistanceMetersRef.current = 0;
    setRideDurationSeconds(0);
    setHasCompletedRide(false);
    setRidePoints([]);
    ridePointCount.current = 0;
    previousRideCoordinates.current = null;
    setDeviceHeading(null);
    setCompassHeading(null);
    rideStartedAtRef.current = Date.now();
    setRideStartedAt(rideStartedAtRef.current);
    setIsRecordingRide(true);
    setCurrentPage("map");
    setIsTrailCardExpanded(false);
    setShowCarActions(false);

    const watchOptions = { enableHighAccuracy: true };
    const rideWatchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (rideStartedAtRef.current === null) {
          console.info("[TrailMate] Ignoring GPS update outside active ride");
          return;
        }

        const newCoordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        console.info("[TrailMate] Ride GPS update", {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          timestamp,
        });
        setCoordinates(newCoordinates);
        setDeviceHeading(
          Number.isFinite(coords.heading) ? coords.heading : null,
        );

        const rejectionReasons = [];
        if (!Number.isFinite(coords.accuracy)) {
          rejectionReasons.push("accuracy unavailable");
        } else if (coords.accuracy > MAX_RIDE_GPS_ACCURACY_METERS) {
          rejectionReasons.push("accuracy over 15 metres");
        }
        if (
          Number.isFinite(coords.speed) &&
          coords.speed <= STATIONARY_SPEED_METERS_PER_SECOND
        ) {
          rejectionReasons.push("stationary or very slow GPS speed");
        }
        if (rejectionReasons.length > 0) {
          console.info("[TrailMate] GPS update not recorded", {
            rejectionReasons,
            accuracy: coords.accuracy,
            speed: coords.speed,
          });
          return;
        }

        const previousCoordinates = previousRideCoordinates.current;
        if (previousCoordinates) {
          const segmentDistance = getDistanceInMeters(
            previousCoordinates,
            newCoordinates,
          );
          if (segmentDistance < MIN_RIDE_POINT_DISTANCE_METERS) {
            console.info("[TrailMate] GPS update below movement threshold", {
              segmentDistanceMeters: segmentDistance,
              minimumMeters: MIN_RIDE_POINT_DISTANCE_METERS,
            });
            return;
          }

          rideDistanceMetersRef.current += segmentDistance;
          setRideDistanceMeters(rideDistanceMetersRef.current);
          console.info("[TrailMate] Ride distance updated", {
            segmentDistanceMeters: segmentDistance,
            totalDistanceMeters: rideDistanceMetersRef.current,
          });
        }

        previousRideCoordinates.current = newCoordinates;
        ridePointCount.current += 1;
        setRidePoints((points) => [...points, newCoordinates]);
        console.info("[TrailMate] Breadcrumb point appended", {
          latitude: newCoordinates.latitude,
          longitude: newCoordinates.longitude,
          acceptedPointCount: ridePointCount.current,
        });
      },
      (error) => {
        console.error("[TrailMate] Ride GPS watch error", {
          code: error.code,
          message: error.message,
        });
        setLocationError(error.message || "Unable to retrieve your location.");
        stopRide();
      },
      watchOptions,
    );
    watchId.current = rideWatchId;
    console.info("[TrailMate] Ride GPS watch started", {
      watchId: rideWatchId,
      options: watchOptions,
    });
  };

  const saveCarLocation = () => {
    if (!coordinates) return;

    setSavedCarLocation(coordinates);
    setStorageError(
      persistStoredData(CAR_LOCATION_STORAGE_KEY, coordinates),
    );
    setShowSavedCarLocation(false);
  };

  const findMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }

    enableDeviceHeading();
    setIsLocating(true);
    setLocationError("");
    setCoordinates(null);
    setDeviceHeading(null);
    setCompassHeading(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setDeviceHeading(
          Number.isFinite(coords.heading) ? coords.heading : null,
        );
        setIsLocating(false);
      },
      (error) => {
        setLocationError(error.message || "Unable to retrieve your location.");
        setIsLocating(false);
      },
    );
  };

  const navigationItems = [
    { id: "map", label: "Map", icon: "⌖" },
    { id: "trails", label: "Trails", icon: "⌁" },
    { id: "ride", label: "Ride", icon: "↗" },
    { id: "downloads", label: "Downloads", icon: "↓" },
  ];

  return (
    <main className="trail-app">
      <Suspense fallback={<div className="map-loading">Loading map...</div>}>
        <TrailMap
          coordinates={coordinates}
          savedCarLocation={savedCarLocation}
          isRecordingRide={isRecordingRide}
          selectedTrailId={selectedTrailId}
          onTrailSelect={selectTrail}
          ridePoints={ridePoints}
          deviceHeading={deviceHeading}
          compassHeading={compassHeading}
        />
      </Suspense>

      <Header location={selectedTrail?.location ?? "Perth Hills"} />

      <div className="map-actions">
        <button
          className="map-action gps-action"
          type="button"
          onClick={findMyLocation}
          disabled={isLocating}
          aria-label={isLocating ? "Finding your location" : "Find my location"}>
          <span aria-hidden="true">{isLocating ? "…" : "⌖"}</span>
        </button>
        <div className="car-action-wrap">
          <button
            className={`map-action car-action${showCarActions ? " is-active" : ""}`}
            type="button"
            onClick={() => setShowCarActions((isOpen) => !isOpen)}
            aria-expanded={showCarActions}
            aria-label="My car">
            <span aria-hidden="true">🚗</span>
          </button>
          {showCarActions && (
            <div className="car-action-popover">
              <div className="popover-heading">
                <strong>My car</strong>
                <button
                  type="button"
                  className="popover-close"
                  onClick={() => setShowCarActions(false)}
                  aria-label="Close My Car panel">
                  ×
                </button>
              </div>
              <CarLocationPanel
                savedCarLocation={savedCarLocation}
                saveCarLocation={saveCarLocation}
                showSavedCarLocation={showSavedCarLocation}
                setShowSavedCarLocation={setShowSavedCarLocation}
                hasCoordinates={Boolean(coordinates)}
              />
              {distanceFromCar !== null && (
                <p className="car-distance">
                  {Math.round(distanceFromCar)} m from your saved car
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {(locationError || storageError || headingError) && (
        <div className="app-alerts" aria-live="polite">
          {locationError && <p role="alert">{locationError}</p>}
          {storageError && <p role="alert">{storageError}</p>}
          {headingError && <p role="status">{headingError}</p>}
        </div>
      )}

      {currentPage === "map" && selectedTrail && !isRecordingRide && (
        <section
          className={`trail-card${isTrailCardExpanded ? " is-expanded" : ""}`}
          aria-labelledby="selected-trail-name"
          onClick={(event) => {
            if (!event.target.closest("button")) {
              setIsTrailCardExpanded((isExpanded) => !isExpanded);
            }
          }}>
          <button
            className="trail-card-grip"
            type="button"
            aria-expanded={isTrailCardExpanded}
            aria-label={isTrailCardExpanded ? "Collapse trail details" : "Expand trail details"}
            onClick={(event) => {
              event.stopPropagation();
              setIsTrailCardExpanded((isExpanded) => !isExpanded);
            }}
          />
          <div className="trail-card-heading">
            <div className="trail-card-copy">
              <h1 id="selected-trail-name">{selectedTrail.name}</h1>
            </div>
            <button
              className="trail-card-close"
              type="button"
              onClick={() => selectTrail(null)}
              aria-label="Close trail details">
              ×
            </button>
          </div>
          <div className="trail-card-stats">
            <div>
              <span className="trail-stat-label">DIFFICULTY</span>
              <span
                className={`trail-stat-value difficulty-value difficulty-${getDifficultyLabel(selectedTrail.difficulty).toLowerCase()}`}>
                <span
                  className={`difficulty-dot difficulty-${getDifficultyLabel(selectedTrail.difficulty).toLowerCase()}`}
                  aria-hidden="true"
                />
                {getDifficultyLabel(selectedTrail.difficulty)}
              </span>
            </div>
            <div>
              <span className="trail-stat-label">DISTANCE</span>
              <span className="trail-stat-value">{selectedTrailLength}</span>
            </div>
          </div>
          {isTrailCardExpanded && (
            <p
              className="trail-description"
              id="selected-trail-description">
              {selectedTrail.description}
            </p>
          )}
          <button
            className="trail-card-button"
            type="button"
            onClick={startRide}>
            <span aria-hidden="true">↗</span>
            START RIDE
          </button>
        </section>
      )}

      {currentPage === "trails" && (
        <section className="content-sheet trails-sheet" aria-labelledby="trails-title">
          <div className="sheet-heading">
            <div>
              <span className="eyebrow">FIND YOUR NEXT RIDE</span>
              <h1 id="trails-title">Trails</h1>
            </div>
            <span className="trail-count">{trails.length} trails</span>
          </div>
          <div className="trail-groups">
            {[...trailsByLocation].map(([location, locationTrails]) => (
              <section className="trail-group" key={location}>
                <h2 className="trail-group-heading">{location}</h2>
                <ul className="trail-list">
                  {locationTrails.map((trail) => (
                    <li key={trail.id}>
                      <button
                        className={`trail-list-item${trail.id === selectedTrailId ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => {
                          selectTrail(trail.id);
                          setCurrentPage("map");
                          setShowCarActions(false);
                        }}>
                        <span className="trail-list-mark" aria-hidden="true">↗</span>
                        <span className="trail-list-copy">
                          <strong>{trail.name}</strong>
                          <small>{getDifficultyLabel(trail.difficulty)}</small>
                        </span>
                        <span className="trail-list-arrow" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}

      {currentPage === "ride" && (
        <section className="content-sheet ride-sheet" aria-labelledby="ride-title">
          <div className="sheet-heading">
            <div>
              <span className="eyebrow">TRACK YOUR SESSION</span>
              <h1 id="ride-title">{isRecordingRide ? "Ride in progress" : "Ride"}</h1>
            </div>
            <span className={`recording-indicator${isRecordingRide ? " is-recording" : ""}`}>
              <span aria-hidden="true" />
              {isRecordingRide ? "RECORDING" : "READY"}
            </span>
          </div>
          <RideRecorder
            hasCompletedRide={hasCompletedRide}
            isRecordingRide={isRecordingRide}
            rideDistanceMeters={rideDistanceMeters}
            rideDurationSeconds={rideDurationSeconds}
            rideHistory={rideHistory}
            startRide={startRide}
            stopRide={stopRide}
          />
        </section>
      )}

      {currentPage === "downloads" && (
        <section className="content-sheet downloads-sheet" aria-labelledby="downloads-title">
          <div className="sheet-heading">
            <div>
              <span className="eyebrow">RIDE OFF THE GRID</span>
              <h1 id="downloads-title">Downloads</h1>
            </div>
          </div>
          <div className="empty-downloads">
            <span className="download-icon" aria-hidden="true">↓</span>
            <h2>Offline maps are coming soon</h2>
            <p>Trail maps are currently available while you’re online.</p>
          </div>
        </section>
      )}

      {isRecordingRide && currentPage === "map" && (
        <button
          className="floating-ride-button"
          type="button"
          onClick={() => setCurrentPage("ride")}
          aria-label="View ride statistics and controls">
          <span aria-hidden="true" />
          Ride
        </button>
      )}

      {!(isRecordingRide && currentPage === "map") && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${currentPage === item.id ? " is-active" : ""}`}
              aria-current={currentPage === item.id ? "page" : undefined}
              onClick={() => {
                setCurrentPage(item.id);
                setShowCarActions(false);
              }}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}

export default App;