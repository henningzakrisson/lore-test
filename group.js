// The sidebar's "Group by" select: shows the select, hidden without this
// script, and shows the tree chosen in it in place of the others. The
// choice is kept for the reader's next page where the browser allows it.

const KEY = "loremaster-group-by";
const box = document.querySelector(".sidebar .group-by");
const select = box.querySelector("select");
const trees = document.querySelectorAll(".sidebar .tree");

function remembered() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function remember(grouping) {
  try {
    localStorage.setItem(KEY, grouping);
  } catch {
    // A browser that keeps nothing still switches the tree.
  }
}

function show(grouping) {
  for (const tree of trees) tree.hidden = tree.dataset.grouping !== grouping;
}

const kept = remembered();
if ([...select.options].some((option) => option.value === kept)) {
  select.value = kept;
}
show(select.value);
box.hidden = false;
select.addEventListener("change", () => {
  show(select.value);
  remember(select.value);
});
