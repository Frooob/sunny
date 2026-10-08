import type { Store } from "./state.ts";
import { generateYearData, yearDataToCSV, type DayGlareResult } from "./dataset.ts";

const MARGIN = { top: 16, right: 16, bottom: 28, left: 42 };
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function mountYearView(container: HTMLElement, store: Store) {
  container.innerHTML = `
    <div class="viz-root">
      <div class="year-header">
        <div>
          <h2>Glare window across the year</h2>
          <p class="subtitle">Time of day the sun shines through the window onto your eye point, by date (local time).</p>
        </div>
        <div class="year-actions">
          <button id="year-recompute" type="button">Recompute</button>
          <button id="year-table-toggle" type="button">View as table</button>
          <button id="year-csv" type="button">Download CSV</button>
        </div>
      </div>
      <div style="position: relative;">
        <svg id="year-chart-svg"></svg>
      </div>
      <div id="year-table-wrap" hidden></div>
    </div>
  `;

  const svg = container.querySelector("#year-chart-svg") as SVGSVGElement;
  const tableWrap = container.querySelector("#year-table-wrap") as HTMLElement;
  const recomputeBtn = container.querySelector("#year-recompute") as HTMLButtonElement;
  const tableToggleBtn = container.querySelector("#year-table-toggle") as HTMLButtonElement;
  const csvBtn = container.querySelector("#year-csv") as HTMLButtonElement;

  let currentData: DayGlareResult[] = [];
  let tooltipEl: HTMLDivElement | null = null;
  let showTable = false;

  function compute() {
    recomputeBtn.disabled = true;
    recomputeBtn.textContent = "Computing…";
    // Let the UI paint the disabled state before the (synchronous) crunch.
    setTimeout(() => {
      const { config, date } = store.get();
      currentData = generateYearData(date.getFullYear(), config, 5);
      draw();
      renderTable();
      recomputeBtn.disabled = false;
      recomputeBtn.textContent = "Recompute";
    }, 0);
  }

  function draw() {
    const width = svg.clientWidth || 600;
    const height = 320;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = "";

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;

    const daysWithGlare = currentData.filter((d) => d.intervals.length > 0);
    if (daysWithGlare.length === 0) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(width / 2));
      text.setAttribute("y", String(height / 2));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "var(--text-secondary)");
      text.textContent = "No glare this year with the current geometry.";
      svg.appendChild(text);
      return;
    }

    let minMin = Infinity;
    let maxMin = -Infinity;
    for (const d of daysWithGlare) {
      for (const iv of d.intervals) {
        minMin = Math.min(minMin, minutesOfDay(iv.start));
        maxMin = Math.max(maxMin, minutesOfDay(iv.end));
      }
    }
    minMin = Math.max(0, Math.floor(minMin / 30) * 30 - 30);
    maxMin = Math.min(24 * 60, Math.ceil(maxMin / 30) * 30 + 30);

    const dayCount = currentData.length;
    const xForIndex = (i: number) => MARGIN.left + (i / (dayCount - 1)) * plotW;
    const yForMinutes = (m: number) =>
      MARGIN.top + (1 - (m - minMin) / (maxMin - minMin)) * plotH;

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    svg.appendChild(g);

    // Hour gridlines + labels.
    for (let m = Math.ceil(minMin / 60) * 60; m <= maxMin; m += 60) {
      const y = yForMinutes(m);
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(MARGIN.left));
      line.setAttribute("x2", String(width - MARGIN.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "var(--gridline)");
      line.setAttribute("stroke-width", "1");
      g.appendChild(line);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String(MARGIN.left - 8));
      label.setAttribute("y", String(y + 3));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("font-size", "11");
      label.setAttribute("fill", "var(--text-muted)");
      label.textContent = `${String(m / 60).padStart(2, "0")}:00`;
      g.appendChild(label);
    }

    // Month ticks.
    let prevMonth = -1;
    currentData.forEach((d, i) => {
      const month = d.date.getMonth();
      if (month !== prevMonth) {
        prevMonth = month;
        const x = xForIndex(i);
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(height - MARGIN.bottom + 16));
        label.setAttribute("text-anchor", "start");
        label.setAttribute("font-size", "11");
        label.setAttribute("fill", "var(--text-muted)");
        label.textContent = MONTH_NAMES[month];
        g.appendChild(label);
      }
    });

    const baseline = document.createElementNS(ns, "line");
    baseline.setAttribute("x1", String(MARGIN.left));
    baseline.setAttribute("x2", String(width - MARGIN.right));
    baseline.setAttribute("y1", String(height - MARGIN.bottom));
    baseline.setAttribute("y2", String(height - MARGIN.bottom));
    baseline.setAttribute("stroke", "var(--baseline)");
    baseline.setAttribute("stroke-width", "1");
    g.appendChild(baseline);

    // Range area: start-time line and end-time line, filled between.
    const topPts: string[] = [];
    const botPts: string[] = [];
    const topPtsRev: string[] = [];
    currentData.forEach((d, i) => {
      if (d.intervals.length === 0) return;
      const iv = d.intervals[0];
      const x = xForIndex(i);
      const yStart = yForMinutes(minutesOfDay(iv.start));
      const yEnd = yForMinutes(minutesOfDay(iv.end));
      topPts.push(`${x},${yStart}`);
      botPts.push(`${x},${yEnd}`);
      topPtsRev.unshift(`${x},${yStart}`);
    });

    const area = document.createElementNS(ns, "polygon");
    area.setAttribute("points", [...botPts, ...topPtsRev].join(" "));
    area.setAttribute("fill", "var(--series-1)");
    area.setAttribute("fill-opacity", "0.18");
    g.appendChild(area);

    for (const pts of [topPts, botPts]) {
      const line = document.createElementNS(ns, "polyline");
      line.setAttribute("points", pts.join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "var(--series-1)");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      g.appendChild(line);
    }

    // Crosshair (hidden until hover).
    const crosshair = document.createElementNS(ns, "line");
    crosshair.setAttribute("y1", String(MARGIN.top));
    crosshair.setAttribute("y2", String(height - MARGIN.bottom));
    crosshair.setAttribute("stroke", "var(--text-muted)");
    crosshair.setAttribute("stroke-width", "1");
    crosshair.setAttribute("visibility", "hidden");
    g.appendChild(crosshair);

    const hitRect = document.createElementNS(ns, "rect");
    hitRect.setAttribute("x", String(MARGIN.left));
    hitRect.setAttribute("y", String(MARGIN.top));
    hitRect.setAttribute("width", String(plotW));
    hitRect.setAttribute("height", String(plotH));
    hitRect.setAttribute("fill", "transparent");
    g.appendChild(hitRect);

    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "chart-tooltip";
      tooltipEl.hidden = true;
      container.style.position = "relative";
      container.appendChild(tooltipEl);
    }
    const tooltip = tooltipEl;

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * width;
      const i = Math.round(((px - MARGIN.left) / plotW) * (dayCount - 1));
      const clamped = Math.max(0, Math.min(dayCount - 1, i));
      const d = currentData[clamped];
      const x = xForIndex(clamped);
      crosshair.setAttribute("x1", String(x));
      crosshair.setAttribute("x2", String(x));
      crosshair.setAttribute("visibility", "visible");

      tooltip.hidden = false;
      tooltip.style.left = `${rect.left - container.getBoundingClientRect().left + x}px`;
      tooltip.style.top = `${rect.top - container.getBoundingClientRect().top + MARGIN.top}px`;
      if (d.intervals.length === 0) {
        tooltip.innerHTML = `<strong>${fmtDate(d.date)}</strong><br>no glare`;
      } else {
        const iv = d.intervals[0];
        tooltip.innerHTML = `<strong>${fmtDate(d.date)}</strong><br><span class="key"></span>${fmtHM(minutesOfDay(iv.start))}–${fmtHM(minutesOfDay(iv.end))}`;
      }
    });
    hitRect.addEventListener("pointerleave", () => {
      crosshair.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    });
  }

  function renderTable() {
    const rows = currentData
      .map((d) => {
        if (d.intervals.length === 0) {
          return `<tr><td>${fmtDate(d.date)}</td><td>&ndash;</td><td>&ndash;</td><td>0</td></tr>`;
        }
        return d.intervals
          .map((iv) => {
            const dur = Math.round((iv.end.getTime() - iv.start.getTime()) / 60000);
            return `<tr><td>${fmtDate(d.date)}</td><td>${fmtHM(minutesOfDay(iv.start))}</td><td>${fmtHM(minutesOfDay(iv.end))}</td><td>${dur}</td></tr>`;
          })
          .join("");
      })
      .join("");
    tableWrap.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Start</th><th>End</th><th>Minutes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  recomputeBtn.addEventListener("click", compute);
  tableToggleBtn.addEventListener("click", () => {
    showTable = !showTable;
    tableWrap.hidden = !showTable;
    svg.closest("div")!.hidden = showTable;
    tableToggleBtn.textContent = showTable ? "View as chart" : "View as table";
  });
  csvBtn.addEventListener("click", () => {
    const csv = yearDataToCSV(currentData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunny-glare-${store.get().date.getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  new ResizeObserver(() => draw()).observe(svg);
  compute();
}
