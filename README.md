# Sunny

Simulates when the sun shines through a window onto a specific point in a
room (e.g. your desk), both as a 3D visualization and as data across the
year.

## Install & run

```bash
npm install
npm run dev
```

Then open the printed local URL (e.g. http://localhost:5173).

## Usage

All inputs live in the side panel (toggle it with the "Settings" button,
top-right — collapsed by default on narrow/mobile screens, where it
overlays the 3D view instead of squeezing it) and update the simulation
live:

- **Theme**: Dark (default), Light, or Dynamic — Dynamic brightens and
  dims continuously with how high the sun currently is, normalized to
  *that day's own* peak (solar noon) rather than an absolute elevation,
  so a low winter sun at high latitude still reaches full brightness at
  its own local noon, same as a high midday sun near the equator
- **Location**: latitude/longitude
- **Earth's orbit**: independently toggle axial tilt (seasons) and orbital
  eccentricity (the ellipse) off, to see how the sky would look with
  either real-world effect removed — e.g. no tilt flattens the sun's
  elevation to a near-constant value year-round (no seasons at all).
  Disabling either switches the astronomy engine from suncalc (used when
  both are on, for full real-world accuracy) to a from-scratch formula
  with tilt/eccentricity as explicit parameters (see `src/astronomy.ts`)
  — the two agree to within ~0.01° when both toggles are on, so nothing
  changes unless you actually touch these.
- **Window & desk geometry**: window azimuth (degrees), window sill/top
  height, window width (centered on the eye point), eye height, distance
  from eye to window (all relative to the room's own floor)
- **Date & time**: a date picker, a day-of-year slider, and a time-of-day
  slider — any of them update the 3D view and current-state readout live.
  The time slider has a **Local / UTC** toggle: this is the one setting
  that governs both how the slider reads/writes and how the day-stepping
  playback modes below advance — local jumps an hour at DST transitions
  (matching your clock); UTC steps by a constant 24h with no jump.
- **View from desk**: button (top-right of the 3D view) that puts the
  camera at the eye's position looking out the window — rotate to look
  around, no zoom/pan (a head turns but doesn't move)
- **Watch the year play out**: animate the date/time forward, in one of
  three modes:
  - *Full day sweep* — plays through real time, night included (the sun
    just goes dark while it's down)
  - *Fixed time each day* — jumps day by day at one chosen clock time, so
    you watch that moment's sun position shift across the year
  - *Daily glare onset* — jumps day by day to the moment glare first
    starts that day
- **Track the sun**: records every sun position visited — by playback or
  by manually dragging a date/day/time slider — into a persistent trail in
  the 3D view, until cleared. In the day-stepping modes this naturally
  records one point per day rather than a dense sweep, since that's all
  that mode visits.

Defaults are pre-filled from the real geometry this was built for (see
`src/config.ts`).

Below the 3D view, "Glare window across the year" shows the computed
glare interval per day for the selected year, as a chart or table, with a
CSV export.

## Build

```bash
npm run build
npm run preview
```
