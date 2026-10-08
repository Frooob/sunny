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
- **Date & time**: scrub through a day; the 3D view and current-state
  readout update accordingly
- **Watch the year play out**: animate the date/time forward, in one of
  three modes:
  - *Full day sweep* — plays through real time, skipping nights
  - *Fixed time each day* — jumps day by day at one chosen clock time, so
    you watch that moment's sun position shift across the year
  - *Daily glare onset* — jumps day by day to the moment glare first
    starts that day
  
  The latter two offer a **Local / UTC** time reference: local time steps
  by calendar day in your timezone (and jumps an hour at DST transitions,
  matching your actual clock); UTC steps by real 24h days with no jump.

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
