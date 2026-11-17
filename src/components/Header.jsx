function Header({ location }) {
  return (
    <header className="map-topbar">
      <div className="brand-lockup">
        <img
          className="brand-logo"
          src="/assets/trailmatewa-logo.png"
          alt="TrailMate WA"
        />
      </div>
      <span className="map-region">
        <span aria-hidden="true" /> {location}
      </span>
    </header>
  );
}

export default Header;
