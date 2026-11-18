// Stock watchlist dashboard - plain JavaScript, no libraries.
const state = { data: null, range: 252, view: "cards", selected: null, sortKey: null, sortDir: -1 };
const $ = (id) => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";

// ---------- formatting ----------
const money = (v, cur = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(v);
const pct = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const signed = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
const parseDay = (s) => new Date(s + "T12:00:00Z");
const fmtDay = (s) =>
  parseDay(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Up/down is shown with an arrow and a sign, never color alone.
function changeHTML(abs, rel, label) {
  const up = rel >= 0;
  const arrow = up ? "▲" : "▼";
  const abstxt = abs == null ? "" : signed(abs) + " ";
  return `<span class="${up ? "up" : "down"}">${arrow} ${abstxt}(${pct(rel)})</span>` +
    (label ? ` <span class="muted">${label}</span>` : "");
}

// ---------- stats ----------
function stats(stock) {
  const p = stock.prices;
  const slice = p.slice(-state.range);
  const last = p[p.length - 1][1];
  const prev = p.length > 1 ? p[p.length - 2][1] : last;
  const first = slice[0][1];
  const closes = p.map((d) => d[1]);
  return {
    slice, last,
    dayAbs: last - prev, dayPct: ((last - prev) / prev) * 100,
    rangeAbs: last - first, rangePct: ((last - first) / first) * 100,
    low: Math.min(...closes), high: Math.max(...closes),
  };
}
const rangeLabel = () => ({ 21: "1M", 63: "3M", 126: "6M", 252: "1Y" })[state.range];

// ---------- charts ----------
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function niceTicks(min, max, count = 4) {
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function drawChart(box, pts, { detailed = false, currency = "USD" } = {}) {
  box.innerHTML = "";
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H || pts.length < 2) return;
  const pad = detailed ? { l: 4, r: 64, t: 10, b: 26 } : { l: 2, r: 2, t: 4, b: 4 };
  const ys = pts.map((d) => d[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const extra = (hi - lo || hi * 0.01) * 0.08;
  lo -= extra; hi += extra;
  const x = (i) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, box);

  if (detailed) {
    // recessive gridlines + right-hand price axis
    for (const t of niceTicks(lo, hi)) {
      el("line", { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), stroke: "var(--grid)", "stroke-width": 1 }, svg);
      const lab = el("text", { x: W - pad.r + 8, y: y(t) + 4, fill: "var(--muted)", "font-size": 11 }, svg);
      lab.textContent = money(t, currency).replace(/\.00$/, "");
    }
    el("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: "var(--axis)", "stroke-width": 1 }, svg);
    // date labels
    const n = Math.max(2, Math.min(6, Math.floor((W - pad.r) / 110)));
    for (let k = 0; k < n; k++) {
      const i = Math.round((k / (n - 1)) * (pts.length - 1));
      const d = parseDay(pts[i][0]);
      const txt = state.range <= 63
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
        : d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
      const anchor = k === 0 ? "start" : k === n - 1 ? "end" : "middle";
      const lab = el("text", { x: x(i), y: H - 8, fill: "var(--muted)", "font-size": 11, "text-anchor": anchor }, svg);
      lab.textContent = txt;
    }
    const area = `M${x(0)},${H - pad.b} ` + pts.map((d, i) => `L${x(i)},${y(d[1])}`).join(" ") +
      ` L${x(pts.length - 1)},${H - pad.b} Z`;
    el("path", { d: area, fill: "var(--series-wash)" }, svg);
  }

  const line = pts.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[1]).toFixed(1)}`).join(" ");
  el("path", { d: line, fill: "none", stroke: "var(--series)", "stroke-width": detailed ? 2 : 1.5,
    "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

  if (!detailed) return;

  // hover layer: crosshair + marker + tooltip
  const cross = el("line", { y1: pad.t, y2: H - pad.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4.5, fill: "var(--series)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg);
  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; box.appendChild(tip);
  const hit = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" }, svg);
  const first = pts[0][1];

  function show(evt) {
    const r = svg.getBoundingClientRect();
    const px = evt.clientX - r.left;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (pts.length - 1))));
    const [day, v] = pts[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(v));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    tip.innerHTML = `<div class="muted">${fmtDay(day)}</div><b>${money(v, currency)}</b><br>` +
      changeHTML(null, ((v - first) / first) * 100, `since ${fmtDay(pts[0][0])}`);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x(i) + 12;
    if (left + tw > W) left = x(i) - tw - 12;
    tip.style.left = left + "px";
    tip.style.top = Math.max(0, y(v) - 60) + "px";
  }
  function hide() {
    cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true;
  }
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerleave", hide);
}

// ---------- rendering ----------
function renderDetail() {
  const s = state.data.stocks.find((t) => t.symbol === state.selected);
  if (!s) return;
  const st = stats(s);
  $("d-symbol").textContent = s.symbol;
  $("d-name").textContent = s.name;
  $("d-price").textContent = money(st.last, s.currency);
  $("d-change").innerHTML =
    changeHTML(st.dayAbs, st.dayPct, "today") + "<br>" + changeHTML(st.rangeAbs, st.rangePct, rangeLabel());
  drawChart($("d-chart"), st.slice, { detailed: true, currency: s.currency });
  $("d-chart").setAttribute("aria-label", `${s.symbol} closing price, last ${rangeLabel()}`);
}

function renderCards() {
  const grid = $("cards");
  grid.innerHTML = "";
  for (const s of state.data.stocks) {
    const st = stats(s);
    const card = document.createElement("button");
    card.className = "card" + (s.symbol === state.selected ? " sel" : "");
    card.innerHTML = `
      <div class="row"><span class="sym">${s.symbol}</span><span class="px">${money(st.last, s.currency)}</span></div>
      <div class="row"><span class="nm">${s.name}</span></div>
      <div class="row chg"><span>${changeHTML(null, st.dayPct, "1D")}</span><span>${changeHTML(null, st.rangePct, rangeLabel())}</span></div>
      <div class="spark"></div>`;
    card.addEventListener("click", () => select(s.symbol));
    grid.appendChild(card);
    drawChart(card.querySelector(".spark"), st.slice);
  }
}

function renderTable() {
  const rows = state.data.stocks.map((s) => ({ s, st: stats(s) }));
  const cols = [
    ["symbol", "Symbol", (r) => r.s.symbol],
    ["name", "Name", (r) => r.s.name],
    ["last", "Last close", (r) => r.st.last],
    ["day", "1D", (r) => r.st.dayPct],
    ["range", rangeLabel(), (r) => r.st.rangePct],
    ["low", "52W low", (r) => r.st.low],
    ["high", "52W high", (r) => r.st.high],
  ];
  if (state.sortKey) {
    const get = cols.find((c) => c[0] === state.sortKey)[2];
    rows.sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * state.sortDir);
  }
  const arrow = (k) => (state.sortKey === k ? (state.sortDir > 0 ? " ↑" : " ↓") : "");
  $("table").innerHTML = `<table><thead><tr>${cols.map(([k, h]) => `<th data-k="${k}">${h}${arrow(k)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(({ s, st }) => `<tr data-s="${s.symbol}">
      <td><b>${s.symbol}</b></td><td>${s.name}</td><td>${money(st.last, s.currency)}</td>
      <td>${changeHTML(null, st.dayPct)}</td><td>${changeHTML(null, st.rangePct)}</td>
      <td>${money(st.low, s.currency)}</td><td>${money(st.high, s.currency)}</td></tr>`).join("")}</tbody></table>`;
  $("table").querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    state.sortDir = state.sortKey === k ? -state.sortDir : (k === "symbol" || k === "name" ? 1 : -1);
    state.sortKey = k;
    renderTable();
  }));
  $("table").querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => { select(tr.dataset.s); window.scrollTo({ top: 0, behavior: "smooth" }); }));
}

function render() {
  renderDetail();
  $("cards").hidden = state.view !== "cards";
  $("table").hidden = state.view !== "table";
  if (state.view === "cards") renderCards(); else renderTable();
}

function select(symbol) {
  state.selected = symbol;
  history.replaceState(null, "", "#" + symbol);
  render();
}

function wireSeg(id, key, attr, parse) {
  $(id).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $(id).querySelectorAll("button").forEach((o) => o.classList.toggle("on", o === b));
    state[key] = parse(b.dataset[attr]);
    render();
  }));
}

async function init() {
  wireSeg("ranges", "range", "range", Number);
  wireSeg("views", "view", "view", String);
  try {
    const res = await fetch("data/prices.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
  } catch (e) {
    $("updated").textContent = "No price data yet - run the \"Update prices\" workflow on GitHub.";
    $("detail").hidden = true;
    return;
  }
  state.data.stocks = state.data.stocks.filter((s) => s.prices.length > 1);
  const updated = new Date(state.data.updated);
  $("updated").textContent = `Updated ${updated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` +
    (state.data.failed?.length ? ` · couldn't load: ${state.data.failed.join(", ")}` : "");
  const fromHash = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  state.selected = state.data.stocks.some((s) => s.symbol === fromHash) ? fromHash : state.data.stocks[0]?.symbol;
  render();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(render, 150); });
}

init();
