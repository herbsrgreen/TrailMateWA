function RideRecorder({
  hasCompletedRide,
  isRecordingRide,
  rideDistanceMeters,
  rideDurationSeconds,
  rideHistory,
  startRide,
  stopRide,
}) {
  return (
    <section>
      <button onClick={startRide} disabled={isRecordingRide}>
        🚵 Start Ride
      </button>
      <button onClick={stopRide} disabled={!isRecordingRide}>
        Stop Ride
      </button>
      {isRecordingRide && <h2>Current Ride</h2>}
      {!isRecordingRide && hasCompletedRide && <h2>Last Ride Summary</h2>}
      <p aria-live="polite">
        Ride duration:{" "}
        {String(Math.floor(rideDurationSeconds / 3600)).padStart(2, "0")}:
        {String(Math.floor((rideDurationSeconds % 3600) / 60)).padStart(2, "0")}:
        {String(rideDurationSeconds % 60).padStart(2, "0")}
      </p>
      <p aria-live="polite">
        Distance travelled: {Math.round(rideDistanceMeters)} metres
      </p>

      {rideHistory.length > 0 && (
        <section>
          <h2>Ride History</h2>
          <ol>
            {rideHistory.map((ride, index) => (
              <li key={`${ride.completedAt}-${index}`}>
                {new Date(ride.completedAt).toLocaleString()} —{" "}
                {Math.floor(ride.durationSeconds / 60)} min,{" "}
                {Math.round(ride.distanceMeters)} metres
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

export default RideRecorder;
