// Lights a map's point, or the box of a name printed on it, while the pointer
// is on its line of the map's key, or a link in the line has the keyboard's
// focus, whether or not the point links to an entry. A line and its point
// name the same label in data-point, and both sit in the map's figure, or in
// the map page's layout. A lit point keeps its label and gets a callout, as a
// locator map's marker has: the place's name on a tag, joined to the point by
// a short line, at the corner of the point where the tag covers the least of
// the map's other marks and stays on the map. A lit name box gets only the
// stylesheet's ring, as its name is on the map already. The key may be split
// in places and regions; each line still names its point. Without the
// script the key and the map still show; nothing is lit.

const LIT = "lit";
// The tag's corners, up-right first, as a locator's, which wins a tie.
const CORNERS = [
  { start: false, below: false },
  { start: true, below: false },
  { start: false, below: true },
  { start: true, below: true },
];
// How far past the point's edge the tag starts, in pixels.
const GAP = 8;
// What a pixel of the tag off the map costs, against one over another mark.
const OFF_MAP = 4;
const callouts = new Map();

function pointsOf(line) {
  const holder = line.closest("figure, .map-layout");
  if (!holder) return [];
  return [...holder.querySelectorAll(".map :is(.point, .name-box)")].filter(
    (point) => point.dataset.point === line.dataset.point,
  );
}

// The place's name: the point's own, or its key line's text after the label.
function nameOf(point, line) {
  if (point.dataset.tip) return point.dataset.tip;
  const label = line.querySelector(".label");
  return [...line.childNodes]
    .filter((node) => node !== label)
    .map((node) => node.textContent)
    .join("")
    .trim();
}

function overlap(one, other) {
  const width = Math.min(one.right, other.right) - Math.max(one.left, other.left);
  const height = Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function area(rect) {
  return rect.width * rect.height;
}

// The part of the map in sight: on a map's page, what its zoomed view shows.
function roomOf(map) {
  const shown = map.getBoundingClientRect();
  const view = map.closest(".map-view")?.getBoundingClientRect() ?? shown;
  const left = Math.max(shown.left, view.left);
  const top = Math.max(shown.top, view.top);
  const right = Math.min(shown.right, view.right);
  const bottom = Math.min(shown.bottom, view.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// What the tag costs at a corner: the area it covers of the other marks, and
// more for the area it leaves the map's part in sight by.
function cost(tag, marks, room) {
  const rect = tag.getBoundingClientRect();
  const covered = marks.reduce((sum, mark) => sum + overlap(rect, mark), 0);
  return covered + OFF_MAP * (area(rect) - overlap(rect, room));
}

function place(callout, tag, map) {
  const marks = [...map.querySelectorAll(":is(.point, .name-box):not(.lit)")].map(
    (mark) => mark.getBoundingClientRect(),
  );
  const room = roomOf(map);
  let best = null;
  for (const corner of CORNERS) {
    callout.classList.toggle("tag-start", corner.start);
    callout.classList.toggle("tag-below", corner.below);
    const spent = cost(tag, marks, room);
    if (!best || spent < best.spent) best = { corner, spent };
  }
  callout.classList.toggle("tag-start", best.corner.start);
  callout.classList.toggle("tag-below", best.corner.below);
}

// A callout at the point's centre, in shares of the map so that zooming it
// keeps the two together, reaching past the point's edge.
function callOut(point, name) {
  const map = point.closest(".map");
  const shown = map.getBoundingClientRect();
  const mark = point.getBoundingClientRect();
  const callout = document.createElement("span");
  callout.className = "key-callout";
  callout.setAttribute("aria-hidden", "true");
  const left = (mark.left + mark.width / 2 - shown.left) / shown.width;
  const top = (mark.top + mark.height / 2 - shown.top) / shown.height;
  callout.style.left = `${left * 100}%`;
  callout.style.top = `${top * 100}%`;
  const reach = Math.max(point.offsetWidth, point.offsetHeight) / 2 + GAP;
  callout.style.setProperty("--reach", `${reach}px`);
  const tag = document.createElement("span");
  tag.className = "locator-tag";
  tag.textContent = name;
  callout.append(tag);
  map.append(callout);
  place(callout, tag, map);
  return callout;
}

function lightPoint(point, line, on) {
  callouts.get(point)?.remove();
  callouts.delete(point);
  point.classList.toggle(LIT, on);
  if (!on || point.matches(".name-box")) return;
  const name = nameOf(point, line);
  if (name) callouts.set(point, callOut(point, name));
}

function light(event, on) {
  const line = event.target.closest?.(".points li[data-point]");
  if (!line || line.contains(event.relatedTarget)) return;
  for (const point of pointsOf(line)) lightPoint(point, line, on);
}

document.addEventListener("pointerover", (event) => light(event, true));
document.addEventListener("pointerout", (event) => light(event, false));
document.addEventListener("focusin", (event) => light(event, true));
document.addEventListener("focusout", (event) => light(event, false));
