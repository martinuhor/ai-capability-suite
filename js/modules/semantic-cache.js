/**
 * Semantic Cache — cosine prompt interceptor with ROI metrics
 */
const SemanticCache = (() => {
  const COST_PER_CALL = 0.002;
  const LATENCY_PER_MISS = 800;

  const SEED = [
    "Explain the difference between RAG and fine-tuning.",
    "How does hybrid retrieval combine BM25 and vectors?",
    "What is Reciprocal Rank Fusion used for?",
    "Summarize enterprise authentication requirements.",
    "How do semantic caches reduce LLM spend?",
  ];

  let store = [];
  let hits = 0;
  let misses = 0;
  let timeline = [];
  let chart = null;

  function addEntry(prompt, response, force = false) {
    const emb = Suite.Vec.embed(prompt);
    store.push({
      id: `C${String(store.length + 1).padStart(3, "0")}`,
      prompt,
      response,
      emb,
      createdAt: Date.now(),
      hits: force ? 0 : 0,
    });
  }

  function fakeResponse(prompt) {
    return `Cached synthesis for: “${prompt.slice(0, 72)}${prompt.length > 72 ? "…" : ""}” · generated locally without external LLM APIs.`;
  }

  function lookup(prompt, threshold) {
    const t0 = performance.now();
    const q = Suite.Vec.embed(prompt);
    let best = null;
    let bestScore = -1;

    store.forEach((entry) => {
      const s = Suite.Vec.cosine(q, entry.emb);
      if (s > bestScore) {
        bestScore = s;
        best = entry;
      }
    });

    const hit = best && bestScore >= threshold;
    const dt = performance.now() - t0;

    if (hit) {
      hits += 1;
      best.hits += 1;
      timeline.push(1);
      Suite.log(
        "cache-log",
        `HIT · sim=${bestScore.toFixed(3)} ≥ θ=${threshold.toFixed(2)} · match=${best.id} · ${dt.toFixed(2)}ms`,
        "ok"
      );
      return { hit: true, score: bestScore, entry: best, dt };
    }

    misses += 1;
    timeline.push(0);
    const response = fakeResponse(prompt);
    addEntry(prompt, response);
    Suite.log(
      "cache-log",
      `MISS · best=${bestScore < 0 ? "n/a" : bestScore.toFixed(3)} < θ=${threshold.toFixed(2)} · cached new entry · ${dt.toFixed(2)}ms`,
      "warn"
    );
    return { hit: false, score: bestScore, entry: store[store.length - 1], dt };
  }

  function metrics() {
    const total = hits + misses;
    const rate = total ? hits / total : 0;
    const saved = hits * COST_PER_CALL;
    const latency = hits * LATENCY_PER_MISS;
    Suite.$("cache-hit-rate").textContent = `${Math.round(rate * 100)}%`;
    Suite.$("cache-saved").textContent = `$${saved.toFixed(3)}`;
    Suite.$("cache-latency").textContent = `${latency.toLocaleString()} ms`;
    Suite.$("cache-entries").textContent = String(store.length);
    Suite.setCacheHitRate(rate);
    return { rate, saved, latency };
  }

  function renderStore() {
    const el = Suite.$("cache-store");
    if (!store.length) {
      el.innerHTML = `<p class="muted">Cache is empty. Seed history or run a lookup.</p>`;
      return;
    }
    el.innerHTML = [...store]
      .reverse()
      .map(
        (e) => `
      <div class="cache-item">
        <h3>${e.id} · hits ${e.hits}</h3>
        <p>${e.prompt}</p>
      </div>`
      )
      .join("");
  }

  function updateChart() {
    const recent = timeline.slice(-20);
    const labels = recent.map((_, i) => String(i + 1));
    const data = {
      labels,
      datasets: [
        {
          label: "Hit=1 / Miss=0",
          data: recent,
          borderColor: "#3ecf8e",
          backgroundColor: "rgba(62, 207, 142, 0.15)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
    if (chart) chart.destroy();
    chart = new Chart(Suite.$("cache-chart"), {
      type: "line",
      data,
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#8b9bb0" } } },
        scales: {
          x: { ticks: { color: "#8b9bb0" }, grid: { color: "#273244" } },
          y: {
            min: 0,
            max: 1,
            ticks: { color: "#8b9bb0", stepSize: 1 },
            grid: { color: "#273244" },
          },
        },
      },
    });
  }

  function onLookup() {
    const prompt = Suite.$("cache-prompt").value.trim();
    const threshold = Number(Suite.$("cache-threshold").value) / 100;
    if (!prompt) {
      Suite.log("cache-log", "Empty prompt", "warn");
      return;
    }
    const result = lookup(prompt, threshold);
    Suite.setLatency(result.dt);
    Suite.bumpOps();
    metrics();
    renderStore();
    updateChart();
  }

  function seed() {
    store = [];
    hits = 0;
    misses = 0;
    timeline = [];
    SEED.forEach((p) => addEntry(p, fakeResponse(p), true));
    Suite.log("cache-log", `Seeded ${SEED.length} historical prompts`, "ok");
    metrics();
    renderStore();
    updateChart();
  }

  function init() {
    Suite.$("cache-threshold").addEventListener("input", (e) => {
      Suite.$("cache-threshold-val").textContent = (
        Number(e.target.value) / 100
      ).toFixed(2);
    });
    Suite.$("cache-threshold-val").textContent = "0.85";
    Suite.$("cache-lookup").addEventListener("click", onLookup);
    Suite.$("cache-seed").addEventListener("click", seed);
    seed();
  }

  return { init, lookup };
})();
