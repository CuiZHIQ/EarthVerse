const state = {
  models: [],
  tasks: [],
  view: "overview",
  selectedModelId: null,
  selectedTaskId: null,
  selectedTask: null,
  detailTab: "question",
  artifactView: "structured",
  chartMetric: "mean_core",
  modelSort: "rank",
  fileSearch: "",
  filters: {
    search: "",
    dimension: "",
    hazard: "",
    region: "",
  },
  previewObjectUrl: null,
};

const capabilityLabels = {
  physical_mechanism: "Physical mechanism",
  spatiotemporal_process: "Spatiotemporal process",
  quantitative_calculation: "Quantitative calculation",
  multi_source_evidence: "Multi-source evidence",
  causal_chain: "Causal chain",
  ranking_decision: "Ranking and decision",
  remote_sensing_geospatial: "Remote sensing & geospatial",
};

const metricLabels = {
  answer_correctness: "Answer correctness",
  llm_rubric: "LLM rubric",
  mean_core: "Mean core",
  strict_at_95: "Strict@95",
  mean_unit_accuracy: "Mean unit accuracy",
};

const detailTabs = [
  ["question", "Question"],
  ["solution", "Solution"],
  ["ground_truth", "Ground truth"],
  ["compute", "Compute"],
  ["evidence", "Event package"],
  ["exploration", "Exploration examples"],
];

const elements = {
  loading: document.querySelector("#loading-screen"),
  overviewTopModels: document.querySelector("#overview-top-models"),
  modelSummary: document.querySelector("#model-summary-strip"),
  strictRankingList: document.querySelector("#strict-ranking-list"),
  barChart: document.querySelector("#model-bar-chart"),
  chartTitle: document.querySelector("#chart-title"),
  chartMetric: document.querySelector("#chart-metric-select"),
  modelSort: document.querySelector("#model-sort-select"),
  leaderboardBody: document.querySelector("#leaderboard-body"),
  modelProfile: document.querySelector("#model-profile"),
  taskSearch: document.querySelector("#task-search"),
  taskList: document.querySelector("#task-list"),
  taskDetail: document.querySelector("#task-detail-panel"),
  filteredTaskCount: document.querySelector("#filtered-task-count"),
  dimensionFilter: document.querySelector("#dimension-filter"),
  hazardFilter: document.querySelector("#hazard-filter"),
  regionFilter: document.querySelector("#region-filter"),
  resetFilters: document.querySelector("#reset-filters"),
  dialog: document.querySelector("#file-preview-dialog"),
  dialogClose: document.querySelector("#close-file-preview"),
  previewCategory: document.querySelector("#preview-category"),
  previewTitle: document.querySelector("#preview-title"),
  previewPath: document.querySelector("#preview-path"),
  previewMeta: document.querySelector("#preview-meta"),
  previewBody: document.querySelector("#preview-body"),
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let revealObserver = null;

function animateCounter(element) {
  const target = Number(element.dataset.countTo || 0);
  if (!Number.isFinite(target)) return;
  if (prefersReducedMotion) {
    element.textContent = target.toLocaleString();
    return;
  }
  const startedAt = performance.now();
  const duration = 900;
  function update(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function observeReveals(root = document) {
  const revealItems = [...root.querySelectorAll("[data-reveal]:not([data-motion-ready])")]
    .filter((item) => !item.closest("[hidden]"));
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => {
      item.dataset.motionReady = "true";
      item.classList.add("is-visible");
    });
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  }
  revealItems.forEach((item) => {
    item.dataset.motionReady = "true";
    revealObserver.observe(item);
  });
  window.setTimeout(() => {
    revealItems.forEach((item) => {
      if (item.classList.contains("is-visible")) return;
      item.classList.add("is-visible");
      revealObserver?.unobserve(item);
    });
  }, 140);
}

function setupMotion() {
  document.querySelectorAll("[data-count-to]").forEach((counter) => {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      animateCounter(counter);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      animateCounter(counter);
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(counter);
  });
  observeReveals();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : digits,
  });
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function median(values) {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pathUrl(file) {
  const localPath = file.preview_url || file.viewer_path || `data/packages/${file.repository_path}`;
  return localPath.split("/").map(encodeURIComponent).join("/");
}

function renderSummaryCard(label, value, note) {
  return `
    <div class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>`;
}

function renderModelSummary() {
  const top = [...state.models].sort((a, b) => b.metrics.mean_core - a.metrics.mean_core)[0];
  const bestStrict = [...state.models].sort((a, b) => b.metrics.strict_at_95 - a.metrics.strict_at_95)[0];
  const medianCore = median(state.models.map((model) => model.metrics.mean_core));
  const medianFiles = median(state.models.map((model) => model.process.avg_unique_files));
  elements.modelSummary.innerHTML = [
    renderSummaryCard("Top mean core", formatNumber(top.metrics.mean_core), top.name),
    renderSummaryCard("Best strict@95", `${formatScore(bestStrict.metrics.strict_at_95)}%`, bestStrict.name),
    renderSummaryCard("Median mean core", formatNumber(medianCore), `Across ${state.models.length} published systems`),
    renderSummaryCard("Median evidence files", formatNumber(medianFiles, 1), "Unique files read per task"),
  ].join("");
}

function renderOverviewTopModels() {
  const leaders = [...state.models]
    .sort((a, b) => b.metrics.mean_core - a.metrics.mean_core)
    .slice(0, 5);
  elements.overviewTopModels.innerHTML = leaders.map((model, index) => `
    <div class="overview-model-row">
      <span class="rank">${String(index + 1).padStart(2, "0")}</span>
      <strong>${escapeHtml(model.name)}</strong>
      <span class="overview-model-track"><span style="width:${Math.max(0, Math.min(100, model.metrics.mean_core))}%"></span></span>
      <span class="overview-model-score">${formatNumber(model.metrics.mean_core)}</span>
    </div>`).join("");
}

function renderStrictRanking() {
  const strictLeaders = [...state.models]
    .sort((a, b) => (b.metrics.strict_at_95 ?? -1) - (a.metrics.strict_at_95 ?? -1));
  elements.strictRankingList.innerHTML = strictLeaders.map((model, index) => {
    const strictScore = model.metrics.strict_at_95 ?? 0;
    const correctCount = model.metrics.strict_correct_count_405 ?? Math.round(strictScore * 405 / 100);
    return `
      <button class="strict-ranking-row ${model.id === state.selectedModelId ? "is-selected" : ""}" type="button" data-strict-model-id="${escapeHtml(model.id)}" aria-label="Inspect ${escapeHtml(model.name)}">
        <span class="strict-rank">${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(model.name)}</strong>
        <span class="strict-score">${formatScore(strictScore)}<small>%</small></span>
        <span class="strict-count">${correctCount} / 405 tasks</span>
        <span class="strict-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, strictScore))}%"></i></span>
      </button>`;
  }).join("");
}

function sortedModels() {
  const models = [...state.models];
  if (state.modelSort === "core") return models.sort((a, b) => b.metrics.mean_core - a.metrics.mean_core);
  if (state.modelSort === "efficiency") {
    return models.sort((a, b) => {
      const aEfficiency = a.metrics.mean_core / Math.max(a.process.avg_tool_calls || 1, 1);
      const bEfficiency = b.metrics.mean_core / Math.max(b.process.avg_tool_calls || 1, 1);
      return bEfficiency - aEfficiency;
    });
  }
  if (state.modelSort === "latency") {
    return models.sort((a, b) => (a.process.avg_latency_s ?? Infinity) - (b.process.avg_latency_s ?? Infinity));
  }
  if (state.modelSort === "tokens") {
    return models.sort((a, b) => (a.process.avg_total_tokens ?? Infinity) - (b.process.avg_total_tokens ?? Infinity));
  }
  return models.sort((a, b) => a.rank - b.rank);
}

function renderModelChart() {
  const metric = state.chartMetric;
  const chartModels = [...state.models].sort((a, b) => (b.metrics[metric] ?? -1) - (a.metrics[metric] ?? -1));
  elements.chartTitle.textContent = `${metricLabels[metric]} by model`;
  elements.barChart.innerHTML = chartModels
    .map((model) => {
      const value = model.metrics[metric] ?? 0;
      return `
        <div class="bar-row" data-reveal role="button" tabindex="0" data-model-id="${escapeHtml(model.id)}" aria-label="Inspect ${escapeHtml(model.name)}">
          <span class="bar-label" title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, value))}%"></span></span>
          <span class="bar-value">${["llm_rubric", "strict_at_95"].includes(metric) ? formatScore(value) : formatNumber(value, 1)}</span>
        </div>`;
    })
    .join("");
  requestAnimationFrame(() => observeReveals(elements.barChart));
}

function renderLeaderboard() {
  elements.leaderboardBody.innerHTML = sortedModels()
    .map((model) => `
      <tr data-model-id="${escapeHtml(model.id)}" class="${model.id === state.selectedModelId ? "is-selected" : ""}" tabindex="0">
        <td>${model.rank}</td>
        <td class="leaderboard-model-cell"><strong>${escapeHtml(model.name)}</strong></td>
        <td>${formatNumber(model.metrics.answer_correctness)}</td>
        <td>${formatScore(model.metrics.llm_rubric)}</td>
        <td class="leaderboard-score-cell"><span class="table-score"><i style="--score-width:${Math.max(0, Math.min(100, model.metrics.mean_core || 0))}%"></i><strong>${formatNumber(model.metrics.mean_core)}</strong></span></td>
        <td>${formatScore(model.metrics.strict_at_95)}%</td>
        <td>${formatNumber(model.process.avg_rounds, 1)}</td>
        <td>${formatNumber(model.process.avg_unique_files, 1)}</td>
        <td>${formatNumber(model.process.avg_latency_s, 1)}s</td>
        <td>${formatNumber(model.process.avg_total_tokens, 0)}</td>
        <td><button class="row-link" type="button" data-open-model-results="${escapeHtml(model.id)}" aria-label="View all results for ${escapeHtml(model.name)}">&#8594;</button></td>
      </tr>`)
    .join("");
}

function renderMetricRows(values, labels) {
  return Object.entries(values)
    .map(([key, value]) => `
      <div class="metric-row">
        <span>${escapeHtml(labels[key] || key)}</span>
        <span class="metric-track"><span class="metric-fill" style="width:${Math.max(0, Math.min(100, value || 0))}%"></span></span>
        <span class="metric-value">${formatNumber(value, 1)}</span>
      </div>`)
    .join("");
}

function renderModelProfile(model) {
  const processItems = [
    ["Rounds", model.process.avg_rounds, 1],
    ["Tool calls", model.process.avg_tool_calls, 1],
    ["File reads", model.process.avg_file_reads, 1],
    ["Unique files", model.process.avg_unique_files, 1],
    ["Python calls", model.process.avg_python_calls, 1],
    ["Evidence queries", model.process.avg_evidence_queries, 2],
    ["Latency (s)", model.process.avg_latency_s, 1],
    ["Total tokens", model.process.avg_total_tokens, 0],
  ];
  elements.modelProfile.innerHTML = `
    <div class="model-profile-header">
      <div>
        <p class="section-kicker">Selected system</p>
        <h3>${escapeHtml(model.name)}</h3>
        <span class="rank-badge">Published rank ${model.rank}</span>
      </div>
    </div>
    <div class="profile-score-grid">
      <div class="profile-score"><strong>${formatNumber(model.metrics.mean_core)}</strong><span>Mean core</span></div>
      <div class="profile-score"><strong>${formatNumber(model.metrics.answer_correctness)}</strong><span>Answer</span></div>
      <div class="profile-score"><strong>${formatScore(model.metrics.llm_rubric)}</strong><span>Rubric</span></div>
    </div>
    <section class="profile-section">
      <h4>Capability profile</h4>
      <div class="metric-list">${renderMetricRows(model.capabilities, capabilityLabels)}</div>
    </section>
    <section class="profile-section">
      <h4>Process diagnostics</h4>
      <div class="process-grid">
        ${processItems.map(([label, value, digits]) => `<div class="process-item"><strong>${formatNumber(value, digits)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}
      </div>
    </section>
    <button class="profile-result-action" type="button" data-open-model-results="${escapeHtml(model.id)}">View all task results &#8594;</button>`;
}

function selectModel(modelId) {
  const model = state.models.find((item) => item.id === modelId);
  if (!model) return;
  state.selectedModelId = model.id;
  renderModelProfile(model);
  renderStrictRanking();
  renderLeaderboard();
}

function addOptions(select, values, formatter = titleCase) {
  const options = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  select.insertAdjacentHTML(
    "beforeend",
    options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join(""),
  );
}

function populateTaskFilters() {
  addOptions(elements.dimensionFilter, state.tasks.flatMap((task) => task.dimensions), (value) => capabilityLabels[value] || titleCase(value));
  addOptions(elements.hazardFilter, state.tasks.map((task) => task.hazard_label), (value) => value);
  addOptions(elements.regionFilter, state.tasks.map((task) => task.region), (value) => value);
}

function filteredTasks() {
  const query = state.filters.search.trim().toLowerCase();
  return state.tasks.filter((task) => {
    const haystack = [
      task.task_id,
      task.title,
      task.event_name,
      task.hazard_family,
      task.hazard_label,
      task.region,
      ...task.dimensions,
    ].join(" ").toLowerCase();
    return (
      (!query || haystack.includes(query))
      && (!state.filters.dimension || task.dimensions.includes(state.filters.dimension))
      && (!state.filters.hazard || task.hazard_label === state.filters.hazard)
      && (!state.filters.region || task.region === state.filters.region)
    );
  });
}

function renderTaskList() {
  const tasks = filteredTasks();
  elements.filteredTaskCount.textContent = tasks.length.toLocaleString();
  elements.taskList.innerHTML = tasks.length
    ? tasks.map((task) => `
      <button class="task-row ${task.task_id === state.selectedTaskId ? "is-selected" : ""}" type="button" data-task-id="${escapeHtml(task.task_id)}">
        <span>
          <span class="task-row-id">${escapeHtml(task.task_id)}</span>
          <span class="task-row-title">${escapeHtml(task.title)}</span>
          <span class="task-row-event">${escapeHtml(task.event_name)}</span>
        </span>
      </button>`).join("")
    : `<div class="empty-state compact-empty"><strong>No matching tasks</strong><p>Adjust the search or reset the active filters.</p></div>`;
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replaceAll("\r\n", "\n").split("\n");
  const html = [];
  let inCode = false;
  let codeLines = [];
  let codeLanguage = "text";
  let listType = null;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      if (inCode) {
        html.push(renderCodeEditor(codeLines.join("\n"), codeLanguage));
        codeLines = [];
      } else {
        codeLanguage = line.slice(3).trim() || "text";
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^\s*-\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const target = unordered ? "ul" : "ol";
      if (listType !== target) {
        closeList();
        listType = target;
        html.push(`<${target}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  if (inCode && codeLines.length) html.push(renderCodeEditor(codeLines.join("\n"), codeLanguage));
  return `<div class="markdown-body">${html.join("")}</div>`;
}

function syntaxHighlightLine(line, language) {
  let highlighted = escapeHtml(line);
  if (["json", "javascript"].includes(language)) {
    highlighted = highlighted
      .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="syntax-key">$1</span>$2')
      .replace(/\b(true|false|null)\b/g, '<span class="syntax-literal">$1</span>')
      .replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="syntax-number">$1</span>');
  } else if (["python", "py"].includes(language)) {
    highlighted = highlighted
      .replace(/\b(def|return|if|else|elif|for|while|in|import|from|as|with|try|except|raise|True|False|None)\b/g, '<span class="syntax-keyword">$1</span>')
      .replace(/(#.*)$/g, '<span class="syntax-comment">$1</span>');
  }
  return highlighted || " ";
}

function renderCodeEditor(source, language = "text", title = "") {
  const lines = String(source ?? "").replaceAll("\r\n", "\n").split("\n");
  return `
    <section class="code-editor" data-language="${escapeHtml(language)}">
      <header class="code-editor-header">
        <span><i></i><i></i><i></i></span>
        <strong>${escapeHtml(title || language.toUpperCase())}</strong>
        <button type="button" class="code-copy" data-copy-code aria-label="Copy ${escapeHtml(title || language)} code">Copy</button>
      </header>
      <div class="code-editor-body">${lines.map((line, index) => `
        <div class="code-line"><span class="line-number">${index + 1}</span><code>${syntaxHighlightLine(line, language)}</code></div>`).join("")}</div>
      <textarea class="code-source" hidden>${escapeHtml(source)}</textarea>
    </section>`;
}

function structuredType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function renderStructuredValue(value, key = "root", depth = 0) {
  const type = structuredType(value);
  if (type === "object" || type === "array") {
    const entries = type === "array" ? value.map((item, index) => [index, item]) : Object.entries(value);
    return `
      <details class="object-node" ${depth < 2 ? "open" : ""}>
        <summary><span class="object-key">${escapeHtml(key)}</span><span class="value-type">${type}</span><span class="object-count">${entries.length}</span></summary>
        <div class="object-children">${entries.map(([childKey, childValue]) => renderStructuredValue(childValue, childKey, depth + 1)).join("")}</div>
      </details>`;
  }
  const display = type === "string" ? `&quot;${escapeHtml(value)}&quot;` : escapeHtml(String(value));
  return `<div class="scalar-row"><span class="object-key">${escapeHtml(key)}</span><span class="scalar-value is-${type}">${display}</span><span class="value-type">${type}</span></div>`;
}

function renderJsonArtifact(title, payload) {
  const structured = state.artifactView === "structured";
  return `
    <div class="artifact-heading">
      <div><p class="section-kicker">Machine-readable reference</p><h3>${escapeHtml(title)}</h3></div>
      <div class="segmented-control" role="group" aria-label="Artifact display mode">
        <button type="button" data-artifact-view="structured" class="${structured ? "is-active" : ""}">Structured</button>
        <button type="button" data-artifact-view="raw" class="${structured ? "" : "is-active"}">Raw JSON</button>
      </div>
    </div>
    ${structured ? `<div class="object-inspector">${renderStructuredValue(payload)}</div>` : renderCodeEditor(JSON.stringify(payload, null, 2), "json", title)}`;
}

function renderEvidenceOverview(task) {
  const categoryCount = Object.keys(task.category_counts || {}).length;
  return `
    <div class="package-intro">
      <div>
        <span class="package-id">${escapeHtml(task.event.package_id || task.event_id || task.task_id.split("_")[0])}</span>
        <h3>${escapeHtml(task.event_name)}</h3>
        <p>Complete local event package with source-level previews and provenance.</p>
      </div>
      <span class="tag">${escapeHtml(task.hazard_label)}</span>
    </div>
    <div class="evidence-overview">
      <div class="evidence-stat"><strong>${task.file_count}</strong><span>Package files</span></div>
      <div class="evidence-stat"><strong>${categoryCount}</strong><span>Evidence categories</span></div>
      <div class="evidence-stat"><strong>${escapeHtml(task.event.data_integrity?.final_data_score ?? "—")}</strong><span>Data integrity score</span></div>
      <div class="evidence-stat"><strong>${escapeHtml(task.event.correspondence_score ?? "—")}</strong><span>Correspondence score</span></div>
    </div>
    <div class="category-map">
      ${Object.entries(task.category_counts || {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => `<span>${escapeHtml(titleCase(category))} · ${count}</span>`).join("")}
    </div>`;
}

function renderEvidenceFiles(task) {
  const query = state.fileSearch.trim().toLowerCase();
  const files = task.event_files.filter((file) => !query || [file.relative_path, file.source_name, file.layer_name, file.category].join(" ").toLowerCase().includes(query));
  const groups = new Map();
  files.forEach((file) => {
    if (!groups.has(file.category)) groups.set(file.category, []);
    groups.get(file.category).push(file);
  });
  const groupHtml = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => `
      <section class="file-group">
        <div class="file-group-header"><h3>${escapeHtml(titleCase(category))}</h3><span>${items.length} files</span></div>
        <div class="file-list">
          ${items.map((file) => `
            <button class="file-row" type="button" data-file-id="${escapeHtml(file.file_id)}">
              <span class="file-visual">${file.preview_type === "image"
                ? `<img src="${pathUrl(file)}" alt="" loading="lazy">`
                : `<span class="file-kind">${escapeHtml(file.preview_type)}</span>`}</span>
              <span class="file-primary"><strong title="${escapeHtml(file.relative_path)}">${escapeHtml(file.relative_path)}</strong><span>${escapeHtml(file.layer_name)}</span></span>
              <span class="file-secondary"><strong>${escapeHtml(file.source_name)}</strong><span>${escapeHtml(file.status)}</span></span>
              <span class="file-size">${formatBytes(file.bytes)}</span>
            </button>`).join("")}
        </div>
      </section>`).join("");
  return `
    ${renderEvidenceOverview(task)}
    <div class="file-tools">
      <div class="task-search-wrap"><label for="file-search">Filter package files</label><input id="file-search" type="search" value="${escapeHtml(state.fileSearch)}" placeholder="Source, path, layer, category…"></div>
    </div>
    ${groupHtml || '<div class="empty-state compact-empty"><strong>No matching files</strong><p>Clear the file filter to restore the package inventory.</p></div>'}`;
}

function detailContent(task) {
  if (state.detailTab === "question") return `<div class="task-question-body">${renderMarkdown(task.question)}</div>`;
  if (state.detailTab === "solution") return renderMarkdown(task.solution);
  if (state.detailTab === "ground_truth") return `<div class="gt-layout">${renderJsonArtifact("Computed ground truth", task.ground_truth)}</div>`;
  if (state.detailTab === "compute") return `<div class="artifact-heading"><div><p class="section-kicker">Reproducible calculation</p><h3>Ground-truth computation</h3></div><span class="tag">Python</span></div>${renderCodeEditor(task.compute_gt_py, "python", "compute_gt.py")}`;
  if (state.detailTab === "evidence") return renderEvidenceFiles(task);
  if (state.detailTab === "exploration") return '<div class="empty-state compact-empty"><strong>Loading Exploration examples</strong><p>Reading real model trajectories for this task.</p></div>';
  return renderMarkdown(task.question);
}

function renderTaskDetail() {
  const task = state.selectedTask;
  if (!task) return;
  const tags = [capabilityLabels[task.primary_dimension] || titleCase(task.primary_dimension), task.hazard_label];
  elements.taskDetail.innerHTML = `
    <header class="task-detail-header">
      <div class="detail-topline">
        <span class="task-row-id">${escapeHtml(task.task_id)}</span>
        <div class="detail-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <h2>${escapeHtml(task.title)}</h2>
      <p class="event-line">${escapeHtml(task.event_name)} / ${escapeHtml(task.region)} / ${escapeHtml(titleCase(task.scale))}</p>
    </header>
    <nav class="detail-tabs" aria-label="Task detail sections">
      ${detailTabs.map(([id, label]) => `<button class="detail-tab ${id === state.detailTab ? "is-active" : ""}" type="button" data-detail-tab="${id}">${label}</button>`).join("")}
    </nav>
    <div class="detail-content">${detailContent(task)}</div>`;
  if (state.detailTab === "exploration") {
    window.BenchmarkExploration?.renderTaskExamples(task.task_id, elements.taskDetail.querySelector(".detail-content"));
  }
}

async function selectTask(taskId) {
  if (!taskId) return;
  state.selectedTaskId = taskId;
  state.detailTab = "question";
  state.artifactView = "structured";
  state.fileSearch = "";
  renderTaskList();
  elements.taskDetail.innerHTML = '<div class="empty-state"><strong>Loading task detail</strong><p>Reading the task and its event package index.</p></div>';
  try {
    const response = await fetch(`data/tasks/${encodeURIComponent(taskId)}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.selectedTask = await response.json();
    renderTaskDetail();
  } catch (error) {
    elements.taskDetail.innerHTML = `<div class="error-banner">Could not load ${escapeHtml(taskId)}: ${escapeHtml(error.message)}</div>`;
  }
}

function switchView(view) {
  state.view = view;
  const navigationView = view === "model-detail" ? "models" : view;
  document.querySelectorAll(".view-tab").forEach((button) => {
    const active = button.dataset.view === navigationView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  window.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => observeReveals(document.querySelector(`[data-panel="${view}"]`)));
}

function parseCsv(text, rowLimit = 100) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length && rows.length <= rowLimit; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (row.length || cell) {
    row.push(cell);
    rows.push(row);
  }
  return rows.slice(0, rowLimit + 1);
}

function renderCsvTable(text) {
  const rows = parseCsv(text);
  if (!rows.length) return '<div class="empty-state compact-empty"><strong>Empty CSV file</strong></div>';
  const [headers, ...body] = rows;
  return `<div class="table-preview"><table><thead><tr>${headers.map((value) => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="preview-footnote">Showing ${body.length.toLocaleString()} data rows.</p>`;
}

async function fetchPreviewText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function openFilePreview(file) {
  if (!file) return;
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
  const rawUrl = pathUrl(file);
  elements.previewCategory.textContent = titleCase(file.category);
  elements.previewTitle.textContent = file.source_name || file.relative_path;
  elements.previewPath.textContent = file.relative_path;
  const metadata = [
    file.file_id,
    file.format || file.preview_type,
    formatBytes(file.bytes),
    file.status,
    file.source_url ? `<a href="${escapeHtml(file.source_url)}" target="_blank" rel="noreferrer">Source provenance</a>` : null,
    `<a href="${rawUrl}" target="_blank" rel="noreferrer">${file.preview_url ? "Open browser preview" : "Open original"}</a>`,
  ].filter(Boolean);
  elements.previewMeta.innerHTML = metadata.map((value) => `<span>${value}</span>`).join("");
  elements.previewBody.innerHTML = '<div class="empty-state compact-empty"><strong>Loading preview</strong></div>';
  elements.dialog.showModal();

  try {
    switch (file.format || file.preview_type) {
      case "json": {
        const text = await fetchPreviewText(rawUrl);
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
        }
        elements.previewBody.innerHTML = `<div class="object-inspector file-object-inspector">${renderStructuredValue(payload)}</div>`;
        break;
      }
      case "csv": {
        elements.previewBody.innerHTML = renderCsvTable(await fetchPreviewText(rawUrl));
        break;
      }
      case "html": {
        const text = await fetchPreviewText(rawUrl);
        state.previewObjectUrl = URL.createObjectURL(new Blob([text], { type: "text/html" }));
        elements.previewBody.innerHTML = `<div class="html-preview-tabs"><span>Rendered document</span><a href="${rawUrl}" target="_blank" rel="noreferrer">View source</a></div><iframe class="preview-frame" sandbox src="${state.previewObjectUrl}" title="Preview of ${escapeHtml(file.source_name)}"></iframe>`;
        break;
      }
      case "image":
      case "pdf": {
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.previewObjectUrl = URL.createObjectURL(await response.blob());
        elements.previewBody.innerHTML = file.format === "image"
          ? `<img class="preview-image" src="${state.previewObjectUrl}" alt="Preview of ${escapeHtml(file.source_name)}">`
          : `<iframe class="preview-frame" src="${state.previewObjectUrl}" title="Preview of ${escapeHtml(file.source_name)}"></iframe>`;
        break;
      }
      case "tiff": {
        elements.previewBody.innerHTML = file.preview_url
          ? `<div class="derived-preview-note"><strong>Browser-safe GeoTIFF preview</strong><span>The original raster remains unchanged.</span></div><img class="preview-image" src="${escapeHtml(file.preview_url)}" alt="Derived preview of ${escapeHtml(file.source_name)}">`
          : `<div class="binary-preview"><span class="file-kind">TIFF</span><h3>Raster derivative unavailable</h3><a class="download-link" href="${rawUrl}" download>Open original file</a></div>`;
        break;
      }
      case "archive": {
        const manifest = file.archive_manifest || { entries: [], entry_count: 0 };
        elements.previewBody.innerHTML = `<div class="archive-heading"><div><p class="section-kicker">Archive manifest</p><h3>${manifest.entry_count.toLocaleString()} members</h3></div>${manifest.truncated ? '<span class="tag">First 200 shown</span>' : ""}</div><div class="archive-list">${manifest.entries.map((entry) => `<div class="archive-row"><span class="file-kind">${entry.is_directory ? "DIR" : "FILE"}</span><code>${escapeHtml(entry.name)}</code><span>${formatBytes(entry.bytes)}</span></div>`).join("")}</div>`;
        break;
      }
      case "binary": {
        elements.previewBody.innerHTML = `<div class="binary-inspector"><div><p class="section-kicker">Binary header</p><h3>First 64 bytes</h3><p>Use the original file for format-specific analysis.</p></div>${renderCodeEditor(file.binary_head_hex || "No readable header", "hex", file.relative_path)}</div>`;
        break;
      }
      default: {
        const text = await fetchPreviewText(rawUrl);
        const limit = 250000;
        const clipped = text.length > limit ? `${text.slice(0, limit)}\n\n[Preview truncated at ${limit.toLocaleString()} characters]` : text;
        elements.previewBody.innerHTML = renderCodeEditor(clipped, file.format || "text", file.relative_path);
      }
    }
  } catch (error) {
    elements.previewBody.innerHTML = `<div class="error-banner">Preview failed: ${escapeHtml(error.message)}</div>`;
  }
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((control) => control.addEventListener("click", () => switchView(control.dataset.view)));
  document.querySelectorAll("[data-open-featured-task]").forEach((control) => control.addEventListener("click", async () => {
    await openFeaturedTask(control.dataset.openFeaturedTask);
  }));
  elements.chartMetric.addEventListener("change", () => {
    state.chartMetric = elements.chartMetric.value;
    renderModelChart();
  });
  elements.modelSort.addEventListener("change", () => {
    state.modelSort = elements.modelSort.value;
    renderLeaderboard();
  });
  elements.barChart.addEventListener("click", (event) => selectModel(event.target.closest("[data-model-id]")?.dataset.modelId));
  elements.barChart.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) selectModel(event.target.closest("[data-model-id]")?.dataset.modelId);
  });
  elements.leaderboardBody.addEventListener("click", (event) => selectModel(event.target.closest("[data-model-id]")?.dataset.modelId));
  elements.leaderboardBody.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) selectModel(event.target.closest("[data-model-id]")?.dataset.modelId);
  });
  elements.strictRankingList.addEventListener("click", (event) => {
    selectModel(event.target.closest("[data-strict-model-id]")?.dataset.strictModelId);
  });

  const filterBindings = [
    [elements.taskSearch, "search", "input"],
    [elements.dimensionFilter, "dimension", "change"],
    [elements.hazardFilter, "hazard", "change"],
    [elements.regionFilter, "region", "change"],
  ];
  filterBindings.forEach(([element, key, eventName]) => element.addEventListener(eventName, () => {
    state.filters[key] = element.value;
    renderTaskList();
  }));
  elements.resetFilters.addEventListener("click", () => {
    Object.keys(state.filters).forEach((key) => { state.filters[key] = ""; });
    elements.taskSearch.value = "";
    [elements.dimensionFilter, elements.hazardFilter, elements.regionFilter].forEach((select) => { select.value = ""; });
    renderTaskList();
  });
  elements.taskList.addEventListener("click", (event) => selectTask(event.target.closest("[data-task-id]")?.dataset.taskId));
  elements.taskDetail.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-detail-tab]");
    if (tab) {
      state.detailTab = tab.dataset.detailTab;
      renderTaskDetail();
      return;
    }
    const artifactView = event.target.closest("[data-artifact-view]");
    if (artifactView) {
      state.artifactView = artifactView.dataset.artifactView;
      renderTaskDetail();
      return;
    }
    const copyButton = event.target.closest("[data-copy-code]");
    if (copyButton) {
      const source = copyButton.closest(".code-editor")?.querySelector(".code-source")?.value || "";
      navigator.clipboard?.writeText(source).then(() => {
        copyButton.textContent = "Copied";
        window.setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
      });
      return;
    }
    const fileRow = event.target.closest("[data-file-id]");
    if (fileRow && state.selectedTask) {
      openFilePreview(state.selectedTask.event_files.find((file) => file.file_id === fileRow.dataset.fileId));
    }
  });
  elements.taskDetail.addEventListener("input", (event) => {
    if (event.target.id === "file-search") {
      state.fileSearch = event.target.value;
      const cursorPosition = event.target.selectionStart;
      renderTaskDetail();
      const replacement = document.querySelector("#file-search");
      replacement?.focus();
      replacement?.setSelectionRange(cursorPosition, cursorPosition);
    }
  });
  elements.dialogClose.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("close", () => {
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  });
}

async function openFeaturedTask(taskId) {
  if (!taskId) return;
  switchView("tasks");
  await selectTask(taskId);
}

async function initialize() {
  bindEvents();
  try {
    const [modelResponse, taskResponse, metadataResponse] = await Promise.all([
      fetch("data/models.json"),
      fetch("data/tasks-index.json"),
      fetch("data/metadata.json"),
    ]);
    if (![modelResponse, taskResponse, metadataResponse].every((response) => response.ok)) {
      throw new Error("One or more benchmark data indexes could not be loaded.");
    }
    const [modelData, taskData, metadata] = await Promise.all([
      modelResponse.json(),
      taskResponse.json(),
      metadataResponse.json(),
    ]);
    state.models = modelData.models;
    state.tasks = taskData.tasks;
    const summaryCounters = {
      "#header-task-count": metadata.task_count,
      "#header-event-count": metadata.event_count,
      "#header-answer-count": metadata.answer_unit_count,
      "#header-hazard-count": metadata.hazard_family_count,
    };
    Object.entries(summaryCounters).forEach(([selector, value]) => {
      const counter = document.querySelector(selector);
      counter.dataset.countTo = String(value);
      counter.textContent = Number(value).toLocaleString();
    });
    renderModelSummary();
    renderOverviewTopModels();
    renderStrictRanking();
    renderModelChart();
    renderLeaderboard();
    populateTaskFilters();
    renderTaskList();
    window.HazardGallery?.mount({
      onSelectHazard: (hazardLabel) => {
        state.filters.hazard = hazardLabel;
        elements.hazardFilter.value = hazardLabel;
        switchView("tasks");
        renderTaskList();
      },
    });
    selectModel(state.models[0]?.id);
    window.BenchmarkExploration?.mount({
      models: state.models,
      tasks: state.tasks,
      switchView,
      openTaskDetail: async (taskId) => {
        switchView("tasks");
        await selectTask(taskId);
      },
      renderStructuredValue,
      renderCodeEditor,
      escapeHtml,
      formatNumber,
    });
    setupMotion();
  } catch (error) {
    document.querySelector("main").insertAdjacentHTML("afterbegin", `<div class="error-banner">Benchmark data failed to load: ${escapeHtml(error.message)}</div>`);
  } finally {
    elements.loading.classList.add("is-hidden");
  }
}

initialize();
