// Zooms and pans the map on a map's page. The map sits in a box that
// scrolls, and zooming makes the map wider or narrower in it, so its points
// stay on their places and keep their size. A wheel or a pinch zooms around
// the pointer, a drag with the mouse pans, a finger pans as any scrolling
// box does, and the buttons and the + and - keys zoom around the middle.
// The page opens on the whole map, however a link reached it. The box
// takes the map's shape, and the key sits beside it when there is room, so
// a tall map leaves no space empty beside it. Without the script the page
// shows the whole map with the key under it.

const MAX_ZOOM = 8;
const STEP_ZOOM = 1.5;
const WHEEL_SPEED = 0.002;
const LINE_HEIGHT = 16;
const DRAG_START = 4;

for (const view of document.querySelectorAll(".map-view")) {
  const image = view.querySelector("img");
  if (image.complete && image.naturalWidth) setUp(view);
  else image.addEventListener("load", () => setUp(view), { once: true });
}

function setUp(view) {
  const map = view.querySelector(".map");
  const image = map.querySelector("img");
  const ratio = image.naturalWidth / image.naturalHeight;
  const layout = view.closest(".map-layout");
  const key = layout?.querySelector(":scope > :is(.points, .key-groups)");
  let scale = 1;

  view.classList.add("zoomable");
  view.tabIndex = 0;
  layout?.style.setProperty("--ratio", ratio);
  layout?.classList.add("shaped");

  // Marks whether the key sits beside the map, where it scrolls in the
  // map's height, or has wrapped under it.
  function placeKey() {
    if (!layout || !key) return;
    layout.style.setProperty("--view-height", `${view.offsetHeight}px`);
    layout.classList.toggle("key-beside", key.offsetTop < view.offsetTop + view.offsetHeight);
  }

  // The width at which the whole map is in view.
  function fitWidth() {
    return Math.min(view.clientWidth, view.clientHeight * ratio);
  }

  // Zooms to `next` times the fit width, keeping the map's spot at
  // (x, y), from the box's top left corner, where it is.
  function zoomTo(next, x = view.clientWidth / 2, y = view.clientHeight / 2) {
    const before = map.getBoundingClientRect();
    const box = view.getBoundingClientRect();
    const shareX = (box.left + x - before.left) / before.width;
    const shareY = (box.top + y - before.top) / before.height;
    scale = Math.min(MAX_ZOOM, Math.max(1, next));
    const width = fitWidth() * scale;
    const height = width / ratio;
    map.style.width = `${width}px`;
    map.style.marginTop = `${Math.max(0, (view.clientHeight - height) / 2)}px`;
    view.scrollLeft = map.offsetLeft + shareX * width - x;
    view.scrollTop = map.offsetTop + shareY * height - y;
  }

  view.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT : 1;
      const box = view.getBoundingClientRect();
      zoomTo(
        scale * Math.exp(-event.deltaY * lines * WHEEL_SPEED),
        event.clientX - box.left,
        event.clientY - box.top,
      );
    },
    { passive: false },
  );

  // A drag with the mouse pans. Once it has moved, the points let the
  // pointer through, so letting go on one does not open its entry.
  let drag = null;
  view.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: view.scrollLeft,
      top: view.scrollTop,
      moved: false,
    };
  });
  view.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
    if (!drag.moved) {
      drag.moved = true;
      view.classList.add("dragging");
      view.setPointerCapture(event.pointerId);
    }
    view.scrollLeft = drag.left - dx;
    view.scrollTop = drag.top - dy;
  });
  const endDrag = () => {
    if (drag?.moved) setTimeout(() => view.classList.remove("dragging"));
    drag = null;
  };
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);
  view.addEventListener("dragstart", (event) => event.preventDefault());

  // Two fingers pinch to zoom; one scrolls the box as the browser does.
  let pinch = null;
  const spread = (touches) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  view.addEventListener("touchstart", (event) => {
    if (event.touches.length === 2) {
      pinch = { distance: spread(event.touches), scale };
    }
  });
  view.addEventListener(
    "touchmove",
    (event) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const box = view.getBoundingClientRect();
      const [a, b] = event.touches;
      zoomTo(
        (pinch.scale * spread(event.touches)) / pinch.distance,
        (a.clientX + b.clientX) / 2 - box.left,
        (a.clientY + b.clientY) / 2 - box.top,
      );
    },
    { passive: false },
  );
  view.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinch = null;
  });

  view.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") zoomTo(scale * STEP_ZOOM);
    else if (event.key === "-") zoomTo(scale / STEP_ZOOM);
    else if (event.key === "0") zoomTo(1);
    else return;
    event.preventDefault();
  });

  const bar = document.querySelector(".map-bar");
  if (bar) {
    bar.hidden = false;
    bar.querySelector(".map-zoom-in").addEventListener("click", () => zoomTo(scale * STEP_ZOOM));
    bar.querySelector(".map-zoom-out").addEventListener("click", () => zoomTo(scale / STEP_ZOOM));
    bar.querySelector(".map-fit").addEventListener("click", () => zoomTo(1));
  }

  addEventListener("resize", () => {
    placeKey();
    zoomTo(scale);
  });
  placeKey();
  zoomTo(1);
}
