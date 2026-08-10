(function () {
  "use strict";

  const TRAJECTORY_DATA_ROOT = "data/exploration/trajectories/";

  const state = {
    models: [],
    tasks: [],
    modelById: new Map(),
    taskById: new Map(),
    selectedModelId: null,
    selectedTaskId: null,
    selectedExampleModelId: null,
    modelProfile: null,
    taskExamples: null,
    cache: new Map(),
    modelQuery: "",
    modelStatus: "",
    taskQuery: "",
  };

  let helpers = {};
  let elements = {};

  function escapeHtml(value) {
    return helpers.escapeHtml ? helpers.escapeHtml(value) : String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatNumber(value, digits = 1) {
    if (helpers.formatNumber) return helpers.formatNumber(value, digits);
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "-";
  }

  function taskInfo(taskId) {
    return state.taskById.get(taskId) || { task_id: taskId, title: taskId, event_name: "Unknown event", difficulty: "" };
  }

  async function fetchJson(url, force = false) {
    if (!force && state.cache.has(url)) return state.cache.get(url);
    const promise = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    state.cache.set(url, promise);
    try {
      return await promise;
    } catch (error) {
      state.cache.delete(url);
      throw error;
    }
  }

  function scoreTrack(label, value) {
    const width = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="result-score-track"><span>${escapeHtml(label)}</span><span class="result-score-line"><i style="width:${width}%"></i></span><strong>${formatNumber(value, 1)}</strong></div>`;
  }

  function metricCell(label, value, suffix = "", digits = null) {
    const precision = digits ?? (Number(value) >= 1000 ? 0 : 1);
    const formatted = precision === 2 && Number.isFinite(Number(value))
      ? Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatNumber(value, precision);
    return `<div class="result-metric"><span>${escapeHtml(label)}</span><strong>${formatted}${suffix}</strong></div>`;
  }

  function renderModelHero(model, profile) {
    return `
      <section class="model-result-hero">
        <div class="model-result-rank"><span>Published rank</span><strong>${String(model.rank).padStart(2, "0")}</strong></div>
        <div class="model-result-identity">
          <p class="section-kicker">Model result profile</p>
          <h2>${escapeHtml(model.name)}</h2>
          <p>Published scores with ten directly inspectable task trajectories.</p>
        </div>
        <div class="model-result-core"><span>Mean core</span><strong>${formatNumber(model.metrics.mean_core, 2)}</strong><small>Published EarthVerse score</small></div>
      </section>
      <section class="model-result-scoreband" aria-label="Core EarthVerse scores">
        ${metricCell("Answer correctness", model.metrics.answer_correctness)}
        ${metricCell("LLM rubric", model.metrics.llm_rubric, "", 2)}
        ${metricCell("Mean core", model.metrics.mean_core)}
        ${metricCell("Strict@95", model.metrics.strict_at_95, "%", 2)}
        ${metricCell("Mean unit", model.metrics.mean_unit_accuracy)}
      </section>
      <div class="model-result-analysis">
        <section><p class="section-kicker">Capability dimensions</p><div class="result-score-stack">${Object.entries(model.capabilities).map(([key, value]) => scoreTrack(key.replaceAll("_", " "), value)).join("")}</div></section>
        <section><p class="section-kicker">Process diagnostics</p><div class="process-diagnostic-grid">
          ${metricCell("Rounds", model.process.avg_rounds)}
          ${metricCell("Tool calls", model.process.avg_tool_calls)}
          ${metricCell("File reads", model.process.avg_file_reads)}
          ${metricCell("Unique files", model.process.avg_unique_files)}
          ${metricCell("Python calls", model.process.avg_python_calls)}
          ${metricCell("Evidence queries", model.process.avg_evidence_queries)}
          ${metricCell("Latency", model.process.avg_latency_s, "s")}
          ${metricCell("Tokens", model.process.avg_total_tokens)}
        </div></section>
      </div>`;
  }

  function resultStatusLabel(result) {
    if (result.status === "not_available") return "Not available";
    if (result.status === "ok") return "Scored output";
    return result.status || "Unknown";
  }

  function renderFeaturedTasks(profile) {
    if (!profile.featured_tasks.length) {
      elements.modelFeatured.innerHTML = '<div class="empty-state compact-empty"><strong>No scored trajectory examples</strong><p>This model has no locally preserved successful output.</p></div>';
      return;
    }
    elements.modelFeatured.innerHTML = profile.featured_tasks.map((result, index) => {
      const task = taskInfo(result.task_id);
      return `<button class="featured-task-row" type="button" data-open-exploration="${escapeHtml(result.task_id)}" data-example-model="${escapeHtml(profile.model_id)}">
        <span class="featured-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="featured-task-copy"><small>${escapeHtml(result.task_id)} / ${escapeHtml(task.event_name)}</small><strong>${escapeHtml(task.title)}</strong></span>
        <span class="featured-score"><small>Overall</small><strong>${formatNumber(result.scores?.overall, 1)}</strong></span>
        <span class="featured-arrow" aria-hidden="true">&#8594;</span>
      </button>`;
    }).join("");
  }

  function filteredModelResults() {
    if (!state.modelProfile) return [];
    const query = state.modelQuery.trim().toLowerCase();
    return state.modelProfile.task_results.slice(0, 10).filter((result) => {
      const task = taskInfo(result.task_id);
      const searchable = `${result.task_id} ${task.title} ${task.event_name}`.toLowerCase();
      const statusMatch = !state.modelStatus
        || (state.modelStatus === "available" && result.status !== "not_available")
        || result.status === state.modelStatus;
      return (!query || searchable.includes(query)) && statusMatch;
    });
  }

  function renderModelTaskResults() {
    const rows = filteredModelResults();
    elements.modelTaskResults.innerHTML = rows.length ? `
      <div class="model-task-table-head"><span>Task</span><span>Status</span><span>Answer</span><span>Rubric</span><span>Overall</span><span></span></div>
      ${rows.map((result) => {
        const task = taskInfo(result.task_id);
        const hasPayload = Boolean(result.payload_url);
        return `<div class="model-task-result ${hasPayload ? "has-output" : "is-missing"}">
          <span class="model-task-name"><small>${escapeHtml(result.task_id)} / ${escapeHtml(task.event_name)}</small><strong>${escapeHtml(task.title)}</strong></span>
          <span><i class="status-dot is-${escapeHtml(result.status)}"></i>${escapeHtml(resultStatusLabel(result))}</span>
          <span>${formatNumber(result.scores?.answer, 1)}</span>
          <span>${formatNumber(result.scores?.rubric, 1)}</span>
          <span><strong>${formatNumber(result.scores?.overall, 1)}</strong></span>
          <span>${hasPayload ? `<button class="row-link" type="button" data-open-exploration="${escapeHtml(result.task_id)}" data-example-model="${escapeHtml(state.modelProfile.model_id)}" aria-label="Open ${escapeHtml(result.task_id)} exploration">&#8594;</button>` : "-"}</span>
        </div>`;
      }).join("")}` : '<div class="empty-state compact-empty"><strong>No matching task results</strong><p>Change the search or status filter.</p></div>';
  }

  async function openModel(modelId) {
    const model = state.modelById.get(modelId);
    if (!model) return;
    state.selectedModelId = modelId;
    helpers.switchView?.("model-detail");
    document.querySelector("#model-detail-title").textContent = model.name;
    elements.modelSummary.innerHTML = '<div class="empty-state"><strong>Loading model results</strong><p>Reading the complete task-level archive.</p></div>';
    elements.modelFeatured.innerHTML = "";
    elements.modelTaskResults.innerHTML = "";
    try {
      const profile = await fetchJson(model.profile_url || `data/exploration/models/${encodeURIComponent(modelId)}.json`);
      state.modelProfile = profile;
      state.modelQuery = "";
      state.modelStatus = "";
      elements.modelSearch.value = "";
      elements.modelStatus.value = "";
      elements.modelSummary.innerHTML = renderModelHero(model, profile);
      renderFeaturedTasks(profile);
      renderModelTaskResults();
    } catch (error) {
      elements.modelSummary.innerHTML = `<div class="error-banner">Model results failed to load: ${escapeHtml(error.message)} <button class="text-button" type="button" data-retry-model="${escapeHtml(modelId)}">Retry</button></div>`;
    }
  }

  function filteredExplorationTasks() {
    const query = state.taskQuery.trim().toLowerCase();
    return state.tasks.filter((task) => !query || [task.task_id, task.title, task.event_name, task.hazard_label, task.region].join(" ").toLowerCase().includes(query));
  }

  function renderExplorationTaskList() {
    const tasks = filteredExplorationTasks();
    elements.explorationTaskCount.textContent = tasks.length.toLocaleString();
    elements.explorationTaskList.innerHTML = tasks.map((task) => `<button class="exploration-task-row ${task.task_id === state.selectedTaskId ? "is-selected" : ""}" type="button" data-exploration-task="${escapeHtml(task.task_id)}">
      <span><small>${escapeHtml(task.task_id)}</small><strong>${escapeHtml(task.title)}</strong><em>${escapeHtml(task.event_name)}</em></span>
    </button>`).join("");
  }

  function exampleRow(example) {
    return `<button class="example-model-row ${example.model_id === state.selectedExampleModelId ? "is-selected" : ""}" type="button" data-example-model-select="${escapeHtml(example.model_id)}">
      <span class="example-model-name"><strong>${escapeHtml(example.model_name)}</strong><small>${example.leaderboard_model ? "Leaderboard system" : "Additional evaluated run"} / ${escapeHtml(resultStatusLabel(example))}</small></span>
      <span class="example-score-group"><small>A ${formatNumber(example.scores?.answer, 0)}</small><small>R ${formatNumber(example.scores?.rubric, 0)}</small><strong>${formatNumber(example.scores?.overall, 1)}</strong></span>
    </button>`;
  }

  function renderTaskComparisonShell(task, taskData) {
    return `
      <header class="comparison-header">
        <div><p class="section-kicker">${escapeHtml(task.task_id)} / ${escapeHtml(task.event_name)}</p><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(task.hazard_label)} / ${escapeHtml(task.region)}</p></div>
        <button class="secondary-action compact-action" type="button" data-open-task-detail="${escapeHtml(task.task_id)}">View task</button>
      </header>
      <div class="comparison-layout">
        <section class="example-model-strip" aria-label="Trajectory examples">
          <div class="example-list-label"><span>${Math.min(5, taskData.example_count)} example runs</span><span>Score</span></div>
          <div class="example-model-strip-items">${taskData.examples.slice(0, 5).map(exampleRow).join("")}</div>
        </section>
        <div id="trajectory-view" class="trajectory-view"><div class="empty-state compact-empty"><strong>Loading exploration</strong><p>Reading the selected model trajectory.</p></div></div>
      </div>`;
  }

  function boundedText(block) {
    if (!block) return "";
    const label = block.truncated ? `<span class="truncation-label">Showing ${Number(block.text.length).toLocaleString()} of ${Number(block.original_chars).toLocaleString()} characters</span>` : "";
    return `${label}<pre>${escapeHtml(block.text || "")}</pre>`;
  }

  function renderRunDiagnostics(payload) {
    const d = payload.diagnostics || {};
    return `<section class="trajectory-diagnostics" aria-label="Run diagnostics">
      ${metricCell("Overall", payload.scores?.overall)}
      ${metricCell("Answer", payload.scores?.answer)}
      ${metricCell("Rubric", payload.scores?.rubric)}
      ${metricCell("Tool calls", d.tool_calls)}
      ${metricCell("Rounds", d.model_rounds)}
      ${metricCell("Unique files", d.unique_evidence_files)}
      ${metricCell("Latency", d.latency_s, "s")}
      ${metricCell("Tokens", d.total_tokens)}
    </section>`;
  }

  function renderTrajectoryTimeline(payload) {
    const calls = payload.tool_calls || [];
    if (!calls.length) return '<div class="empty-state compact-empty"><strong>No tool calls preserved</strong><p>The run ended before a package exploration step was recorded.</p></div>';
    return `<div class="trajectory-timeline">${calls.map((call, index) => {
      const hasCode = call.code?.text;
      const hasOutput = call.output?.text || call.stdout?.text || call.stderr?.text;
      return `<article class="timeline-step ${call.ok ? "is-success" : "is-error"}">
        <div class="timeline-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="timeline-step-main">
          <header><div><span class="tool-name">${escapeHtml(call.tool)}</span><span class="tool-state">${call.ok ? "Success" : "Failed"}</span></div><p>${escapeHtml(call.reason || "No tool rationale recorded")}</p></header>
          <div class="timeline-files">${(call.evidence_files || []).map((file) => `<code>${escapeHtml(file)}</code>`).join("")}</div>
          <button class="timeline-toggle" type="button" aria-expanded="false">Inspect call details <span aria-hidden="true">+</span></button>
          <div class="timeline-details" hidden>
            <section><h4>Arguments</h4>${helpers.renderStructuredValue ? `<div class="object-inspector compact-object">${helpers.renderStructuredValue(call.args || {})}</div>` : `<pre>${escapeHtml(JSON.stringify(call.args || {}, null, 2))}</pre>`}</section>
            ${hasCode ? `<section><h4>Python / calculation</h4>${boundedText(call.code)}</section>` : ""}
            ${hasOutput ? `<section><h4>Tool output</h4>${boundedText(call.output)}${boundedText(call.stdout)}${boundedText(call.stderr)}</section>` : ""}
            ${(call.warnings || []).length ? `<section><h4>Warnings</h4><ul>${call.warnings.map((warning) => `<li>${escapeHtml(typeof warning === "string" ? warning : JSON.stringify(warning))}</li>`).join("")}</ul></section>` : ""}
          </div>
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function renderEvidenceClaims(payload) {
    const evidence = payload.evidence || [];
    return `<section class="trajectory-band"><div class="trajectory-band-heading"><p class="section-kicker">Evidence map</p><h3>Claims grounded in package files</h3></div><div class="evidence-claim-list">${evidence.length ? evidence.map((item) => `<div class="evidence-claim"><span>${escapeHtml(item.support_type || "evidence")}</span><strong>${escapeHtml(item.claim || "")}</strong><code>${escapeHtml(item.source_file || "")}</code></div>`).join("") : '<p class="muted-copy">No structured evidence claims were preserved.</p>'}</div></section>`;
  }

  function renderReasoningSummary(payload) {
    const steps = payload.reasoning_summary || [];
    const unresolved = payload.unsupported_or_unresolved || [];
    return `<section class="trajectory-band reasoning-band"><div class="trajectory-band-heading"><p class="section-kicker">Synthesis</p><h3>Reasoning path</h3></div><ol class="reasoning-list">${steps.map((step) => `<li>${escapeHtml(typeof step === "string" ? step : JSON.stringify(step))}</li>`).join("")}</ol>${unresolved.length ? `<div class="unresolved-box"><strong>Unsupported or unresolved</strong><ul>${unresolved.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")}</ul></div>` : ""}</section>`;
  }

  function renderFinalAnswer(payload) {
    const content = helpers.renderStructuredValue
      ? `<div class="object-inspector final-answer-object">${helpers.renderStructuredValue(payload.final_answer)}</div>`
      : `<pre>${escapeHtml(JSON.stringify(payload.final_answer, null, 2))}</pre>`;
    return `<section class="trajectory-band final-answer-band"><div class="trajectory-band-heading"><p class="section-kicker">Submitted result</p><h3>Final answer</h3></div>${content}</section>`;
  }

  function renderTrajectory(payload) {
    return `${renderRunDiagnostics(payload)}
      <section class="trajectory-process"><div class="trajectory-section-heading"><div><p class="section-kicker">Tool-by-tool record</p><h3>Exploration timeline</h3></div><span>${escapeHtml(payload.diagnostics?.termination_reason || payload.diagnostics?.run_status || "unknown")}</span></div>${renderTrajectoryTimeline(payload)}</section>
      ${renderEvidenceClaims(payload)}
      ${renderReasoningSummary(payload)}
      ${renderFinalAnswer(payload)}
      <footer class="trajectory-provenance"><span>Trajectory provenance</span><code>${escapeHtml(payload.provenance?.trajectory_path || "")}</code><span>Judge provenance</span><code>${escapeHtml(payload.provenance?.judge_path || "")}</code></footer>`;
  }

  async function loadExample(modelId, container = null) {
    if (!state.taskExamples) return;
    const example = state.taskExamples.examples.find((item) => item.model_id === modelId) || state.taskExamples.examples[0];
    if (!example) return;
    state.selectedExampleModelId = example.model_id;
    const target = container || document.querySelector("#trajectory-view");
    if (!container) {
      document.querySelectorAll(".example-model-row").forEach((row) => row.classList.toggle("is-selected", row.dataset.exampleModelSelect === example.model_id));
    }
    target.innerHTML = '<div class="empty-state compact-empty"><strong>Loading trajectory</strong><p>Reading tool calls, calculations, evidence, and final answer.</p></div>';
    try {
      if (!example.payload_url?.startsWith(TRAJECTORY_DATA_ROOT)) {
        throw new Error("Invalid trajectory payload path");
      }
      const payload = await fetchJson(example.payload_url);
      target.innerHTML = renderTrajectory(payload);
    } catch (error) {
      target.innerHTML = `<div class="error-banner">Trajectory failed to load: ${escapeHtml(error.message)} <button class="text-button" type="button" data-retry-trajectory="${escapeHtml(example.model_id)}">Retry</button></div>`;
    }
  }

  function withRequestedModelExample(taskData, taskId, modelId) {
    if (!modelId || taskData.examples.some((item) => item.model_id === modelId)) {
      return taskData;
    }
    const requested = state.modelProfile?.task_results?.find(
      (item) => item.task_id === taskId && item.model_id === modelId && item.payload_url,
    );
    if (!requested) return taskData;
    const examples = [requested, ...taskData.examples.filter((item) => item.model_id !== modelId)].slice(0, 5);
    return { ...taskData, example_count: examples.length, examples };
  }

  async function openTask(taskId, modelId = null) {
    const task = taskInfo(taskId);
    state.selectedTaskId = taskId;
    state.selectedExampleModelId = modelId;
    helpers.switchView?.("exploration");
    renderExplorationTaskList();
    elements.explorationComparison.innerHTML = '<div class="empty-state"><strong>Loading exploration examples</strong><p>Ranking real scored trajectories for this task.</p></div>';
    try {
      const loadedTaskData = await fetchJson(`data/exploration/tasks/${encodeURIComponent(taskId)}.json`);
      const taskData = withRequestedModelExample(loadedTaskData, taskId, modelId);
      state.taskExamples = taskData;
      if (!taskData.examples.some((item) => item.model_id === state.selectedExampleModelId)) {
        state.selectedExampleModelId = taskData.examples[0]?.model_id || null;
      }
      elements.explorationComparison.innerHTML = renderTaskComparisonShell(task, taskData);
      await loadExample(state.selectedExampleModelId);
    } catch (error) {
      elements.explorationComparison.innerHTML = `<div class="error-banner">Exploration examples failed to load: ${escapeHtml(error.message)} <button class="text-button" type="button" data-retry-task="${escapeHtml(taskId)}">Retry</button></div>`;
    }
  }

  async function renderTaskExamples(taskId, container) {
    container.innerHTML = '<div class="empty-state compact-empty"><strong>Loading Exploration examples</strong><p>Reading five preserved model trajectories.</p></div>';
    try {
      const task = taskInfo(taskId);
      const taskData = await fetchJson(`data/exploration/tasks/${encodeURIComponent(taskId)}.json`);
      const visibleExamples = taskData.examples.slice(0, 5);
      container.innerHTML = `<div class="embedded-exploration-heading"><div><p class="section-kicker">Exploration examples</p><h3>Five approaches to the same task</h3><p>A compact set of preserved model runs for inspection.</p></div><button class="secondary-action compact-action" type="button" data-open-full-exploration="${escapeHtml(taskId)}">Open comparison page</button></div><div class="embedded-example-strip">${visibleExamples.map((item) => `<button type="button" data-embedded-model="${escapeHtml(item.model_id)}"><strong>${escapeHtml(item.model_name)}</strong><em>${formatNumber(item.scores?.overall, 1)}</em></button>`).join("")}</div><div id="embedded-trajectory" class="embedded-trajectory"></div>`;
      state.taskExamples = taskData;
      state.selectedTaskId = task.task_id;
      const firstModel = visibleExamples[0]?.model_id;
      if (firstModel) await loadExample(firstModel, container.querySelector("#embedded-trajectory"));
    } catch (error) {
      container.innerHTML = `<div class="error-banner">Exploration examples failed to load: ${escapeHtml(error.message)}</div>`;
    }
  }

  function bindEvents() {
    elements.modelSearch.addEventListener("input", () => { state.modelQuery = elements.modelSearch.value; renderModelTaskResults(); });
    elements.modelStatus.addEventListener("change", () => { state.modelStatus = elements.modelStatus.value; renderModelTaskResults(); });
    elements.explorationSearch.addEventListener("input", () => { state.taskQuery = elements.explorationSearch.value; renderExplorationTaskList(); });

    document.addEventListener("click", (event) => {
      const modelResult = event.target.closest("[data-open-model-results]");
      if (modelResult) return void openModel(modelResult.dataset.openModelResults);
      const taskResult = event.target.closest("[data-open-exploration]");
      if (taskResult) return void openTask(taskResult.dataset.openExploration, taskResult.dataset.exampleModel || null);
      const taskRow = event.target.closest("[data-exploration-task]");
      if (taskRow) return void openTask(taskRow.dataset.explorationTask);
      const exampleRowElement = event.target.closest("[data-example-model-select]");
      if (exampleRowElement) return void loadExample(exampleRowElement.dataset.exampleModelSelect);
      const taskDetail = event.target.closest("[data-open-task-detail]");
      if (taskDetail) return void helpers.openTaskDetail?.(taskDetail.dataset.openTaskDetail);
      const fullExploration = event.target.closest("[data-open-full-exploration]");
      if (fullExploration) return void openTask(fullExploration.dataset.openFullExploration);
      const embedded = event.target.closest("[data-embedded-model]");
      if (embedded) {
        document.querySelectorAll("[data-embedded-model]").forEach((item) => item.classList.toggle("is-selected", item === embedded));
        return void loadExample(embedded.dataset.embeddedModel, document.querySelector("#embedded-trajectory"));
      }
      const toggle = event.target.closest(".timeline-toggle");
      if (toggle) {
        const details = toggle.nextElementSibling;
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.lastElementChild.textContent = expanded ? "+" : "-";
        details.hidden = expanded;
        return;
      }
      const retryModel = event.target.closest("[data-retry-model]");
      if (retryModel) return void openModel(retryModel.dataset.retryModel);
      const retryTask = event.target.closest("[data-retry-task]");
      if (retryTask) return void openTask(retryTask.dataset.retryTask);
      const retryTrajectory = event.target.closest("[data-retry-trajectory]");
      if (retryTrajectory) return void loadExample(retryTrajectory.dataset.retryTrajectory);
    });
  }

  function mount(options) {
    helpers = options;
    state.models = options.models || [];
    state.tasks = options.tasks || [];
    state.modelById = new Map(state.models.map((model) => [model.id, model]));
    state.taskById = new Map(state.tasks.map((task) => [task.task_id, task]));
    elements = {
      modelSummary: document.querySelector("#model-detail-summary"),
      modelFeatured: document.querySelector("#model-featured-tasks"),
      modelTaskResults: document.querySelector("#model-task-results"),
      modelSearch: document.querySelector("#model-task-search"),
      modelStatus: document.querySelector("#model-task-status"),
      explorationSearch: document.querySelector("#exploration-task-search"),
      explorationTaskCount: document.querySelector("#exploration-task-count"),
      explorationTaskList: document.querySelector("#exploration-task-list"),
      explorationComparison: document.querySelector("#exploration-comparison"),
    };
    bindEvents();
    renderExplorationTaskList();
  }

  window.BenchmarkExploration = {
    mount,
    openModel,
    openTask,
    renderTaskExamples,
    renderTrajectoryTimeline,
    renderRunDiagnostics,
    renderEvidenceClaims,
    renderReasoningSummary,
    renderFinalAnswer,
  };
}());
