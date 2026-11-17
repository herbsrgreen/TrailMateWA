function LocationPanel({
  coordinates,
  distanceFromCar,
  findMyLocation,
  isLocating,
  locationError,
}) {
  return (
    <section>
      <button onClick={findMyLocation} disabled={isLocating}>
        {isLocating ? "Finding Location..." : "📍 Find My Location"}
      </button>

      {coordinates && (
        <p aria-live="polite">
          Latitude: {coordinates.latitude}, Longitude: {coordinates.longitude}
        </p>
      )}
      {distanceFromCar !== null && (
        <p aria-live="polite">
          Distance from car: {Math.round(distanceFromCar)} metres
        </p>
      )}
      {locationError && <p role="alert">{locationError}</p>}
    </section>
  );
}

export default LocationPanel;
