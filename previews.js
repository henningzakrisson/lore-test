// Page previews: when the pointer rests on a link to an entry, a card shows
// the entry's picture, title, type, description and first lines, as
// Wikipedia's page previews do. A point or a name box on a map that links
// nothing shows its name, from data-tip, in a card of the same look and
// place, so every mark on a map answers a resting pointer the same way. A
// link in the text waits SHOW_DELAY, so that reading does not set cards off;
// a mark on a map waits MARK_DELAY, and none at all while a card shows, so
// that the pointer can run over a map's marks. The cards' text is in
// previews.json, by page path. Until it loads, and where it cannot (a page
// opened from disk, a touch screen), the stylesheet's box with the
// description, or with a map point's key text, shows instead.

const SHOW_DELAY = 400;
const MARK_DELAY = 100;
const HIDE_DELAY = 300;
const GAP = 6;
const MARGIN = 8;
const root = new URL("./", import.meta.url);
const here = decodeURIComponent(location.pathname);
let previews = {};
let card = null;
let shown = null;
let waiting = null;
let showTimer = 0;
let hideTimer = 0;

function pagePath(link) {
  const url = new URL(link.href, location.href);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
    return null;
  }
  const path = decodeURIComponent(url.pathname);
  if (path === here) return null;
  return path.slice(root.pathname.length);
}

function previewOf(link) {
  if (link.closest(".search, .page-preview")) return null;
  return previews[pagePath(link)] ?? null;
}

// What the card of a link or a map's mark shows: the entry's preview, or
// only the mark's name.
function cardOf(target) {
  return target.matches("a[href]") ? previewOf(target) : { title: target.dataset.tip, name: true };
}

function line(className, text) {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

// The entry's lead picture, at a height the stylesheet fixes so the card
// can be placed before it loads. One that fails to load is taken out, and
// `removed` places the smaller card again.
function picture(path, removed) {
  const image = document.createElement("img");
  image.className = "page-preview-picture";
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    image.remove();
    removed();
  });
  image.src = new URL(path, root).href;
  return image;
}

// The card's text sits in its own box, below the picture if there is one.
function build(data, removed) {
  const box = document.createElement("div");
  box.className = data.name ? "page-preview page-preview-name" : `page-preview kind-${data.kind}`;
  box.id = "page-preview";
  box.setAttribute("role", "tooltip");
  if (data.picture) box.append(picture(data.picture, removed));
  const text = document.createElement("div");
  text.className = "page-preview-text";
  if (!data.name) text.append(line("page-preview-type", data.type));
  text.append(line("page-preview-title", data.title));
  if (data.description) {
    text.append(line("page-preview-description", data.description));
  }
  if (data.text) text.append(line("page-preview-lines", data.text));
  box.append(text);
  return box;
}

// Below the line of the link the pointer is on, or above it if the card
// does not fit below; from the link's left edge, or ending at its right edge
// if it does not fit that way. It never covers the link.
function place(box, link, pointer) {
  const lines = [...link.getClientRects()];
  const rect =
    lines.find((each) => pointer && pointer.y >= each.top && pointer.y <= each.bottom) ??
    lines[0];
  const { width, height } = box.getBoundingClientRect();
  const below =
    rect.bottom + GAP + height <= innerHeight - MARGIN ||
    rect.top - GAP - height < MARGIN;
  const top = below ? rect.bottom + GAP : rect.top - GAP - height;
  const fitsRight = rect.left + width <= innerWidth - MARGIN;
  const left = fitsRight ? rect.left : Math.max(MARGIN, rect.right - width);
  box.style.top = `${top + scrollY}px`;
  box.style.left = `${left + scrollX}px`;
  box.classList.toggle("above", !below);
}

function show(link, pointer) {
  hide();
  waiting = null;
  const box = build(cardOf(link), () => place(box, link, pointer));
  card = box;
  document.body.append(card);
  place(card, link, pointer);
  link.setAttribute("aria-describedby", card.id);
  shown = link;
}

function hide() {
  clearTimeout(hideTimer);
  shown?.removeAttribute("aria-describedby");
  card?.remove();
  card = null;
  shown = null;
}

function wait(link, pointer) {
  clearTimeout(showTimer);
  waiting = link;
  const mark = link.closest(".map") !== null;
  if (mark && card) show(link, pointer);
  else showTimer = setTimeout(() => show(link, pointer), mark ? MARK_DELAY : SHOW_DELAY);
}

function leave() {
  clearTimeout(showTimer);
  waiting = null;
  clearTimeout(hideTimer);
  if (card) hideTimer = setTimeout(hide, HIDE_DELAY);
}

// The link with a preview, or else the map's mark with a name, that `target`
// is in.
function linkAt(target) {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (link && previewOf(link)) return link;
  return target.closest(".map [data-tip]");
}

function listen() {
  document.addEventListener("mouseover", (event) => {
    if (card?.contains(event.target)) {
      clearTimeout(hideTimer);
      return;
    }
    const link = linkAt(event.target);
    if (!link) return;
    if (link === shown) clearTimeout(hideTimer);
    else if (link !== waiting) wait(link, { y: event.clientY });
  });
  document.addEventListener("mouseout", (event) => {
    const from = card?.contains(event.target) ? card : linkAt(event.target);
    if (!from || from.contains(event.relatedTarget)) return;
    leave();
  });
  document.addEventListener("focusin", (event) => {
    const link = linkAt(event.target);
    if (link) wait(link, null);
  });
  document.addEventListener("focusout", leave);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearTimeout(showTimer);
      waiting = null;
      hide();
    }
  });
  document.addEventListener("click", hide);
  document.addEventListener("scroll", hide, { capture: true, passive: true });
}

if (!matchMedia("(hover: none)").matches) {
  fetch(new URL("previews.json", root))
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((data) => {
      previews = data;
      document.documentElement.classList.add("previews");
      listen();
    })
    .catch(() => {});
}
