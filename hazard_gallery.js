(function attachHazardGallery(global) {
  const MANIFEST_URL = "assets/disasters/credits.json";
  const reducedMotionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tile(item, index, duplicate) {
    const widthClass = `hazard-tile-${(index % 4) + 1}`;
    return `<button class="hazard-tile ${widthClass}" type="button" data-hazard-label="${escapeHtml(item.hazard_label)}"${duplicate ? ' aria-hidden="true" tabindex="-1"' : ""}>
      <img src="assets/disasters/${escapeHtml(item.file)}" alt="${duplicate ? "" : escapeHtml(item.alt)}" loading="${index < 4 && !duplicate ? "eager" : "lazy"}">
      <span class="hazard-tile-caption"><strong>${escapeHtml(item.hazard_label)}</strong><small>${escapeHtml(item.evidence_cue)} / ${escapeHtml(item.agency)}</small></span>
    </button>`;
  }

  function renderRail(root, items) {
    const sequence = items.map((item, index) => tile(item, index, false)).join("");
    const duplicate = items.map((item, index) => tile(item, index, true)).join("");
    root.innerHTML = `<div class="hazard-rail-track"><div class="hazard-rail-set">${sequence}</div><div class="hazard-rail-set" aria-hidden="true">${duplicate}</div></div>`;
  }

  function setPaused(root, paused) {
    root.classList.toggle("is-paused", paused);
  }

  function bindPauseBehavior(root) {
    root.addEventListener("mouseenter", () => setPaused(root, true));
    root.addEventListener("mouseleave", () => setPaused(root, root.contains(document.activeElement)));
    root.addEventListener("focusin", () => setPaused(root, true));
    root.addEventListener("focusout", () => global.setTimeout(() => setPaused(root, root.contains(document.activeElement)), 0));
  }

  function applyMotionPreference(roots) {
    roots.forEach((root) => root.classList.toggle("is-reduced-motion", reducedMotionQuery.matches));
  }

  async function mount({ onSelectHazard } = {}) {
    const roots = [
      document.querySelector("#hazard-rail-primary"),
      document.querySelector("#hazard-rail-secondary"),
    ];
    if (roots.some((root) => !root)) return;

    try {
      const response = await fetch(MANIFEST_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = shuffle(await response.json());
      const midpoint = Math.ceil(items.length / 2);
      renderRail(roots[0], items.slice(0, midpoint));
      renderRail(roots[1], items.slice(midpoint));
      roots.forEach((root) => {
        bindPauseBehavior(root);
        root.addEventListener("click", (event) => {
          const tileButton = event.target.closest("[data-hazard-label]");
          if (!tileButton) return;
          onSelectHazard?.(tileButton.dataset.hazardLabel);
        });
      });
      applyMotionPreference(roots);
      reducedMotionQuery.addEventListener?.("change", () => applyMotionPreference(roots));
    } catch (error) {
      roots[0].innerHTML = `<p class="hazard-gallery-error">Official hazard imagery could not be loaded: ${escapeHtml(error.message)}</p>`;
      roots[1].hidden = true;
    }
  }

  global.HazardGallery = { mount };
}(window));
