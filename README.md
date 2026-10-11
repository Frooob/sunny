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

All inputs live in the side panel and update the simulation live:

- **Location**: latitude/longitude
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
