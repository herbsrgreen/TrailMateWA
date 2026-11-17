function CarLocationPanel({
  savedCarLocation,
  saveCarLocation,
  showSavedCarLocation,
  setShowSavedCarLocation,
  hasCoordinates,
}) {
  return (
    <section>
      <button onClick={saveCarLocation} disabled={!hasCoordinates}>
        🚗 Save Car Location
      </button>

      <button
        onClick={() => setShowSavedCarLocation(true)}
        disabled={!savedCarLocation}>
        🚗 Show Saved Car Location
      </button>

      {savedCarLocation && <p aria-live="polite">Car Location Saved</p>}
      {showSavedCarLocation && savedCarLocation && (
        <p aria-live="polite">
          Saved car location — Latitude: {savedCarLocation.latitude}, Longitude:{" "}
          {savedCarLocation.longitude}
        </p>
      )}
    </section>
  );
}

export default CarLocationPanel;
