// The sidebar's search box: shows the box and lists the entries the site's
// Pagefind index finds, each with its title, kind and type, description and
// the words around the match. "/" focuses the box, the arrow keys move
// through the results, Enter opens one and Escape clears the box. Toggles
// above the results narrow them to kinds when they span more than one. A
// page opened from disk cannot load the index, so the box stays hidden there.

const MAX_RESULTS = 8;
const EXCERPT_WORDS = 16;
const root = new URL("./", import.meta.url);
const form = document.querySelector("form.search");
const input = form.querySelector("input");
const panel = form.querySelector(".search-panel");
const filters = form.querySelector(".filters");
const results = form.querySelector(".results");
const more = form.querySelector(".more");
const chosenKinds = new Set();
let pagefind = null;
let active = -1;

function load() {
  pagefind ??= import(new URL("pagefind/pagefind.js", root).href).then(
    async (module) => {
      await module.options({ baseUrl: root.pathname, excerptLength: EXCERPT_WORDS });
      await module.filters();
      return module;
    },
  );
  return pagefind;
}

function element(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text) made.textContent = text;
  return made;
}

function result(data, index) {
  const item = element("li");
  item.setAttribute("role", "option");
  item.id = `search-result-${index}`;
  const link = element("a");
  link.href = data.url;
  link.tabIndex = -1;
  link.append(element("strong", "", data.meta.title));
  const what = [data.meta.kind, data.meta.type].filter(Boolean).join(" · ");
  if (what) link.append(element("small", "kind", what));
  if (data.meta.description) link.append(element("span", "", data.meta.description));
  if (data.excerpt) {
    const excerpt = element("span", "excerpt");
    excerpt.innerHTML = data.excerpt;
    link.append(excerpt);
  }
  item.append(link);
  return item;
}

function toggles(counts) {
  const kinds = Object.keys(counts ?? {}).filter((kind) => counts[kind] > 0 || chosenKinds.has(kind));
  if (kinds.length < 2 && !chosenKinds.size) return [];
  return kinds.sort().map((kind) => {
    const button = element("button", "", kind);
    button.type = "button";
    button.setAttribute("aria-pressed", String(chosenKinds.has(kind)));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (chosenKinds.has(kind)) chosenKinds.delete(kind);
      else chosenKinds.add(kind);
      search();
    });
    return button;
  });
}

function clear() {
  results.replaceChildren();
  filters.replaceChildren();
  more.textContent = "";
  panel.classList.remove("open");
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  active = -1;
}

function mark(index) {
  const items = [...results.querySelectorAll("[role=option]")];
  if (!items.length) return;
  active = (index + items.length) % items.length;
  items.forEach((item, at) => item.classList.toggle("on", at === active));
  input.setAttribute("aria-activedescendant", items[active].id);
  items[active].scrollIntoView({ block: "nearest" });
}

async function search() {
  const ready = load();
  const query = input.value.trim();
  if (!query) {
    clear();
    return;
  }
  const options = chosenKinds.size ? { filters: { kind: { any: [...chosenKinds] } } } : {};
  const found = await (await ready).debouncedSearch(query, options);
  if (found === null) return;
  const shown = await Promise.all(
    found.results.slice(0, MAX_RESULTS).map((each) => each.data()),
  );
  if (input.value.trim() !== query) return;
  const counts = { ...(found.totalFilters?.kind ?? {}) };
  results.replaceChildren(
    ...(shown.length ? shown.map(result) : [element("li", "empty", form.dataset.empty)]),
  );
  filters.replaceChildren(...toggles(counts));
  const rest = found.results.length - shown.length;
  more.textContent = rest > 0 ? form.dataset.more.replace("{count}", rest) : "";
  panel.classList.add("open");
  input.setAttribute("aria-expanded", "true");
  active = -1;
  input.removeAttribute("aria-activedescendant");
}

if (location.protocol !== "file:") {
  form.hidden = false;
}
input.addEventListener("focus", search);
input.addEventListener("input", search);
form.addEventListener("focusout", (event) => {
  if (!form.contains(event.relatedTarget)) clear();
});
input.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    mark(active + (event.key === "ArrowDown" ? 1 : -1));
  } else if (event.key === "Escape") {
    input.value = "";
    chosenKinds.clear();
    clear();
    input.blur();
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const links = results.querySelectorAll("a");
  links[Math.max(active, 0)]?.click();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (form.hidden) return;
  event.preventDefault();
  input.focus();
});
