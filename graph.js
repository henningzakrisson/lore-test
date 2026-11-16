// Draws graph.json with d3 into each .graph box. A box with data-preview is
// a small still picture. The graph page's box can be dragged and zoomed: a
// hovered entry brightens its neighbours and shows in the card, a click
// selects it and a second click opens its page, the legend hides and shows
// kinds, and the page's hash, an entry's name, selects and centres it. The
// box takes the keyboard's focus too: the arrow keys select the nearest
// entry that way, Page Up and Page Down step through the entries by their
// connections, Enter opens the selected one, Escape clears it, + and -
// zoom, and a status line tells screen readers what the card shows. A box
// over the graph finds an entry by its title and selects and centres it,
// and a switch in the card hides every entry but the selected one and
// those it is connected to, fitted to the view. Where the card lies over
// the box, the view keeps the card's side free, and the box is no taller
// than the drawing needs at its width.

const LABELLED = 0.15;
const LABELLED_LEAST = 4;
const LABEL_SIZE = 12;
const LABEL_HEIGHT = 15;
const LABEL_HALO = 3;
const LETTER_WIDTH = 6.6;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 8;
const FOCUS_ZOOM = 2;
const MOVE_TIME = 450;
const KEY_ZOOM = 1.5;
const EDGE_ROOM = 40;
const FIT_MARGIN = [160, 60];
const CARD_GAP = 16;
const DIRECTIONS = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

for (const box of document.querySelectorAll(".graph")) {
  fetch(box.dataset.graph)
    .then((response) => response.json())
    .then((data) => draw(box, data));
}

function radius(node) {
  return 3 + Math.sqrt(node.connections) * 1.6;
}

function layout(nodes, edges) {
  return d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((node) => node.name).distance(80))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("collide", d3.forceCollide((node) => radius(node) + 3))
    .force("x", d3.forceX())
    .force("y", d3.forceY())
    .stop()
    .tick(300);
}

function fitted(nodes, width, height, margin) {
  const [left, right] = d3.extent(nodes, (node) => node.x);
  const [top, bottom] = d3.extent(nodes, (node) => node.y);
  const scale = Math.min(
    width / (right - left + margin[0]),
    height / (bottom - top + margin[1]),
    2,
  );
  return d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(scale)
    .translate(-(left + right) / 2, -(top + bottom) / 2);
}

function draw(box, { nodes, edges }) {
  const simulation = layout(nodes, edges);
  const svg = d3.select(box).append("svg");
  const layer = svg.append("g");
  const lines = layer.append("g").selectAll("line").data(edges).join("line")
    .attr("class", (edge) => (edge.current && edge.certain ? "edge" : "edge muted"));
  const dots = layer.append("g").selectAll("circle").data(nodes).join("circle")
    .attr("class", (node) => `node kind-${node.kind}`)
    .attr("r", radius);
  const place = () => {
    lines.attr("x1", (edge) => edge.source.x).attr("y1", (edge) => edge.source.y)
      .attr("x2", (edge) => edge.target.x).attr("y2", (edge) => edge.target.y);
    dots.attr("cx", (node) => node.x).attr("cy", (node) => node.y);
  };
  place();
  if (box.hasAttribute("data-preview")) {
    layer.attr("transform", fitted(nodes, box.clientWidth, box.clientHeight, [40, 40]));
    return;
  }
  explore({ box, svg, layer, lines, dots, nodes, edges, simulation, place });
}

function explore({ box, svg, layer, lines, dots, nodes, edges, simulation, place }) {
  const view = box.closest(".graph-view");
  const panel = view.querySelector(".graph-panel");
  const status = view.querySelector(".graph-status");
  const toggles = view.querySelectorAll(".graph-legend button");
  const finder = view.querySelector(".graph-find");
  const near = panel.querySelector(".graph-near input");
  const neighbours = new Map(nodes.map((node) => [node, new Set([node])]));
  for (const edge of edges) {
    neighbours.get(edge.source).add(edge.target);
    neighbours.get(edge.target).add(edge.source);
  }
  const byBigness = [...nodes].sort((a, b) => b.connections - a.connections);
  const labels = layer.append("g").selectAll("text").data(nodes).join("text")
    .text((node) => node.title);
  const hiddenKinds = new Set();
  let hovered = null;
  let chosen = null;
  let scale = 1;
  let fitScale = 1;
  let pending = false;

  // The width the card covers at the box's right, with a gap, when it lies
  // over the box; nothing when it sits below it.
  function cardRoom() {
    const style = getComputedStyle(panel);
    return style.position === "absolute" ? parseFloat(style.width) + CARD_GAP : 0;
  }

  // The part of the box's width the drawing is fitted and centred in.
  const roomWidth = () => box.clientWidth - cardRoom();

  // Sets the box's height to what the whole drawing needs when fitted to
  // its width; the style sheet's limits on the height still hold.
  function sizeBox() {
    const [left, right] = d3.extent(nodes, (node) => node.x);
    const [top, bottom] = d3.extent(nodes, (node) => node.y);
    const k = Math.min(roomWidth() / (right - left + FIT_MARGIN[0]), 2);
    box.style.height = `${Math.ceil(k * (bottom - top + FIT_MARGIN[1]))}px`;
  }

  const visible = (node) => !hiddenKinds.has(node.kind)
    && (!near.checked || !chosen || neighbours.get(chosen).has(node));
  const focus = () => hovered ?? chosen;

  // Labels go to the focused entry first, then its neighbours, then the
  // most connected entries: LABELLED of them at the fitted zoom, and more
  // with the square of the zoom past it. A label that would cover one
  // already placed is left out.
  function shownLabels() {
    const centre = focus();
    const near = centre ? byBigness.filter((node) => neighbours.get(centre).has(node)) : [];
    const zoomed = Math.max(1, scale / fitScale);
    const count = Math.ceil(Math.max(LABELLED_LEAST, nodes.length * LABELLED) * zoomed ** 2);
    const big = byBigness.slice(0, count).filter((node) => !near.includes(node));
    const taken = [];
    const shown = new Set();
    for (const node of [...(centre ? [centre] : []), ...near, ...big]) {
      if (!visible(node) || shown.has(node)) continue;
      const start = (node.x + size(node)) * scale + 4;
      const room = {
        left: start,
        right: start + node.title.length * LETTER_WIDTH,
        top: node.y * scale - LABEL_HEIGHT / 2,
        bottom: node.y * scale + LABEL_HEIGHT / 2,
      };
      const clash = taken.some((other) => room.left < other.right && other.left < room.right
        && room.top < other.bottom && other.top < room.bottom);
      if (clash && node !== centre) continue;
      taken.push(room);
      shown.add(node);
    }
    return shown;
  }

  // Past the fitted zoom, entries grow with its square root, so zooming in
  // spreads them apart more than it swells them.
  const size = (node) => radius(node) * Math.min(1, Math.sqrt(fitScale / scale));

  function paint() {
    pending = false;
    const centre = focus();
    const near = centre ? neighbours.get(centre) : null;
    const shown = shownLabels();
    dots.attr("r", size);
    const touches = (edge) => centre !== null && (edge.source === centre || edge.target === centre);
    dots.classed("hidden", (node) => !visible(node))
      .classed("faded", (node) => near !== null && !near.has(node))
      .classed("on", (node) => node === chosen);
    lines.classed("hidden", (edge) => !visible(edge.source) || !visible(edge.target))
      .classed("faded", (edge) => near !== null && !touches(edge))
      .classed("on", touches);
    labels.classed("shown", (node) => shown.has(node))
      .classed("faded", (node) => near !== null && !near.has(node))
      .attr("x", (node) => node.x + size(node) + 4 / scale)
      .attr("y", (node) => node.y + 4 / scale)
      .style("font-size", `${LABEL_SIZE / scale}px`)
      .style("stroke-width", `${LABEL_HALO / scale}px`);
    card(centre);
  }

  function repaint() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(paint);
  }

  function card(node) {
    panel.hidden = !node;
    const said = node ? `${node.title}. ${meta(node)}. ${node.description}` : "";
    if (status.textContent !== said) status.textContent = said;
    if (!node) return;
    const title = panel.querySelector(".graph-title");
    title.textContent = node.title;
    title.href = node.href;
    panel.querySelector(".graph-open").href = node.href;
    panel.querySelector(".graph-meta").textContent = meta(node);
    panel.querySelector(".graph-description").textContent = node.description;
  }

  function meta(node) {
    return `${node.type} · ${box.dataset.connections.replace("{count}", node.connections)}`;
  }

  // The visible entry nearest `from` in the direction [x, y], weighing how
  // far off the direction an entry lies twice as much as how far along it.
  // Entries within 60 degrees of the direction come first, then any on
  // that side; null if there is none.
  function nearest(from, [x, y], shown) {
    const scored = shown
      .filter((node) => node !== from)
      .map((node) => {
        const dx = node.x - from.x;
        const dy = node.y - from.y;
        const along = dx * x + dy * y;
        const off = Math.abs(dx * y - dy * x);
        return { node, along, off, score: along + 2 * off };
      })
      .filter(({ along }) => along > 0)
      .sort((a, b) => a.score - b.score);
    const ahead = scored.find(({ along, off }) => off <= along * Math.sqrt(3));
    return (ahead ?? scored[0])?.node ?? null;
  }

  // Centres `node` if it lies outside the box, or near its edge.
  function bringIntoView(node) {
    const [x, y] = d3.zoomTransform(svg.node()).apply([node.x, node.y]);
    const inside = x > EDGE_ROOM && x < roomWidth() - EDGE_ROOM
      && y > EDGE_ROOM && y < box.clientHeight - EDGE_ROOM;
    if (!inside) centreOn(node);
  }

  function keyed(event) {
    const shown = byBigness.filter(visible);
    const from = chosen && visible(chosen) ? chosen : null;
    const step = { PageDown: 1, PageUp: -1 }[event.key];
    let next = null;
    if (event.key in DIRECTIONS) {
      next = from ? nearest(from, DIRECTIONS[event.key], shown) ?? from : shown[0];
    } else if (step) {
      const index = from ? shown.indexOf(from) : -1;
      next = shown[(index + step + shown.length) % shown.length];
    } else if (event.key === "Home") {
      next = shown[0];
    } else if (event.key === "Enter" && from) {
      window.location.href = from.href;
    } else if (event.key === "+" || event.key === "=") {
      svg.transition().duration(MOVE_TIME).call(zoom.scaleBy, KEY_ZOOM);
    } else if (event.key === "-") {
      svg.transition().duration(MOVE_TIME).call(zoom.scaleBy, 1 / KEY_ZOOM);
    } else {
      return;
    }
    event.preventDefault();
    if (next && next !== from) {
      choose(next, false);
      bringIntoView(next);
    }
  }

  const zoom = d3.zoom().on("zoom", (event) => {
    scale = event.transform.k;
    layer.attr("transform", event.transform);
    repaint();
  });
  svg.call(zoom).on("dblclick.zoom", null);

  function fit(animate) {
    const width = roomWidth();
    const height = box.clientHeight;
    const shown = nodes.filter(visible);
    const target = fitted(shown.length ? shown : nodes, width, height, FIT_MARGIN);
    fitScale = target.k;
    const [left, right] = d3.extent(nodes, (node) => node.x);
    const [top, bottom] = d3.extent(nodes, (node) => node.y);
    const reach = Math.max(width, height) / fitScale;
    zoom.scaleExtent([fitScale * MIN_ZOOM, fitScale * MAX_ZOOM])
      .translateExtent([[left - reach, top - reach], [right + reach, bottom + reach]]);
    (animate ? svg.transition().duration(MOVE_TIME) : svg).call(zoom.transform, target);
  }

  function centreOn(node) {
    const k = Math.max(scale, fitScale * FOCUS_ZOOM);
    const target = d3.zoomIdentity
      .translate(roomWidth() / 2, box.clientHeight / 2)
      .scale(k)
      .translate(-node.x, -node.y);
    svg.transition().duration(MOVE_TIME).call(zoom.transform, target);
  }

  function choose(node, centre) {
    chosen = node;
    const address = node
      ? `#${encodeURIComponent(node.name)}`
      : location.pathname + location.search;
    history.replaceState(null, "", address);
    if (!node && near.checked) {
      near.checked = false;
      fit(true);
    } else if (node && near.checked) {
      fit(true);
    } else if (node && centre) {
      centreOn(node);
    }
    repaint();
  }

  // The entry whose title is `text`, case aside, else the first, most
  // connected first, whose title starts with it, else one that holds it.
  function titled(text) {
    const wanted = text.trim().toLocaleLowerCase();
    if (!wanted) return null;
    const folded = (node) => node.title.toLocaleLowerCase();
    return byBigness.find((node) => folded(node) === wanted)
      ?? byBigness.find((node) => folded(node).startsWith(wanted))
      ?? byBigness.find((node) => folded(node).includes(wanted))
      ?? null;
  }

  function find(event) {
    event.preventDefault();
    const input = finder.querySelector("input");
    const node = titled(input.value);
    input.setCustomValidity(node ? "" : finder.dataset.empty);
    if (!node) {
      input.reportValidity();
      return;
    }
    hiddenKinds.delete(node.kind);
    syncLegend();
    if (chosen && !neighbours.get(chosen).has(node)) near.checked = false;
    choose(node, true);
    input.value = "";
  }

  function syncLegend() {
    for (const button of toggles) {
      button.setAttribute("aria-pressed", String(!hiddenKinds.has(button.dataset.kind)));
    }
  }

  function fromHash() {
    const wanted = decodeURIComponent(location.hash.slice(1));
    const node = nodes.find(
      (each) => each.name === wanted || decodeURIComponent(each.href) === wanted,
    );
    if (!node) return;
    hiddenKinds.delete(node.kind);
    syncLegend();
    choose(node, true);
  }

  dots
    .on("pointerenter", (event, node) => {
      if (event.pointerType !== "mouse") return;
      hovered = node;
      repaint();
    })
    .on("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      hovered = null;
      repaint();
    })
    .on("click", (event, node) => {
      event.stopPropagation();
      if (node === chosen) {
        window.location.href = node.href;
        return;
      }
      choose(node, false);
    });
  svg.on("click", () => choose(null, false))
    .attr("tabindex", 0)
    .attr("role", "application")
    .attr("aria-label", box.dataset.keys)
    .on("keydown", keyed);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") choose(null, false);
  });

  dots.call(d3.drag()
    .on("start", (event) => { if (!event.active) simulation.alphaTarget(0.3).restart(); })
    .on("drag", (event) => { event.subject.fx = event.x; event.subject.fy = event.y; })
    .on("end", (event) => {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = event.subject.fy = null;
    }));
  simulation.on("tick", () => { place(); repaint(); });

  for (const button of toggles) {
    button.addEventListener("click", () => {
      const kind = button.dataset.kind;
      if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
      else hiddenKinds.add(kind);
      syncLegend();
      if (chosen && !visible(chosen)) choose(null, false);
      if (hovered && !visible(hovered)) hovered = null;
      repaint();
    });
  }
  view.querySelector(".graph-fit").addEventListener("click", () => {
    near.checked = false;
    repaint();
    fit(true);
  });
  near.addEventListener("change", () => {
    if (hovered && !visible(hovered)) hovered = null;
    repaint();
    fit(true);
  });
  const titles = finder.querySelector("datalist");
  titles.replaceChildren(...[...nodes]
    .sort((a, b) => a.title.localeCompare(b.title, document.documentElement.lang))
    .map((node) => {
      const option = document.createElement("option");
      option.value = node.title;
      return option;
    }));
  finder.addEventListener("submit", find);
  finder.querySelector("input").addEventListener("change", (event) => {
    if (titles.querySelector(`option[value="${CSS.escape(event.target.value)}"]`)) find(event);
  });
  finder.querySelector("input").addEventListener("input", (event) => {
    event.target.setCustomValidity("");
  });
  finder.hidden = false;

  sizeBox();
  fit(false);
  let lastWidth = box.clientWidth;
  let lastSize = `${box.clientWidth}x${box.clientHeight}`;
  new ResizeObserver(() => {
    if (box.clientWidth !== lastWidth) {
      lastWidth = box.clientWidth;
      sizeBox();
    }
    const size = `${box.clientWidth}x${box.clientHeight}`;
    if (size === lastSize) return;
    lastSize = size;
    fit(false);
    if (chosen) centreOn(chosen);
  }).observe(box);
  window.addEventListener("hashchange", fromHash);
  fromHash();
  repaint();
}
