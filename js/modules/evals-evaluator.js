/**
 * Automated Evals — SQL log parse, clustering, LLM-as-a-Judge, charts
 */
const EvalsEvaluator = (() => {
  const SAMPLE_LOG = `-- DuckDB / prompt_logs extract
SELECT id, ts, prompt, latency_ms, model FROM prompt_logs WHERE ts > now() - INTERVAL '7' DAY;
-- rows (simulated in-memory parser)
1|2026-03-01T10:01:00Z|Explain RAG vs fine-tuning|820|local-sim
2|2026-03-01T10:05:12Z|How does RRF fuse rankings?|640|local-sim
3|2026-03-01T11:22:40Z|Draft a summary of Q3 revenue drivers|1102|local-sim
4|2026-03-02T09:14:03Z|What are auth rate limit policies?|705|local-sim
5|2026-03-02T09:18:55Z|Explain authentication MFA requirements|688|local-sim
6|2026-03-02T14:02:11Z|Generate SQL for average order by region|930|local-sim
7|2026-03-03T08:41:29Z|Compare LoRA rank 8 vs 16 tradeoffs|1015|local-sim
8|2026-03-03T12:09:47Z|How does semantic caching save cost?|577|local-sim
9|2026-03-04T16:33:02Z|Cluster similar support prompts|860|local-sim
10|2026-03-04T17:01:19Z|Judge answer faithfulness to citations|940|local-sim`;

  let rows = [];
  let judged = [];
  let clusterChart = null;
  let scoreChart = null;

  function parseLog(text) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => /^\d+\|/.test(l));
    rows = lines.map((line) => {
      const [id, ts, prompt, latency, model] = line.split("|");
      return {
        id: Number(id),
        ts,
        prompt,
        latency_ms: Number(latency),
        model,
        cluster: null,
        score: null,
        rationale: null,
      };
    });
    return rows;
  }

  function clusterPrompts(items) {
    // Greedy cosine clustering
    const clusters = [];
    items.forEach((item) => {
      const emb = Suite.Vec.embed(item.prompt);
      let assigned = false;
      for (const c of clusters) {
        const sim = Suite.Vec.cosine(emb, c.centroid);
        if (sim >= 0.55) {
          c.members.push(item);
          // update centroid
          for (let i = 0; i < c.centroid.length; i++) {
            c.centroid[i] = (c.centroid[i] * (c.members.length - 1) + emb[i]) / c.members.length;
          }
          item.cluster = c.name;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        const name = `Cluster-${String.fromCharCode(65 + clusters.length)}`;
        item.cluster = name;
        clusters.push({ name, centroid: emb, members: [item] });
      }
    });
    return clusters;
  }

  function judge(item) {
    // Heuristic LLM-as-a-Judge simulation (faithfulness / relevance / clarity)
    const tokens = Suite.Vec.tokenize(item.prompt);
    const hasQuestion = /\?|how|what|explain|compare|generate|draft/i.test(item.prompt);
    const specificity = Math.min(1, tokens.length / 12);
    const latencyPenalty = item.latency_ms > 1000 ? 0.08 : 0;
    const base = 0.62 + specificity * 0.28 + (hasQuestion ? 0.06 : 0) - latencyPenalty;
    const noise = (Math.sin(item.id * 12.9898) * 0.5 + 0.5) * 0.08;
    const score = Math.max(0.35, Math.min(0.98, base + noise));
    const pass = score >= 0.75;
    const rationale = pass
      ? "High relevance, clear intent, sufficient specificity for downstream eval."
      : "Ambiguous or underspecified prompt; recommend rewriting for faithfulness checks.";
    return { score, pass, rationale };
  }

  function renderTable() {
    const el = Suite.$("evals-table");
    if (!judged.length && !rows.length) {
      el.innerHTML = `<p class="muted">Parse logs to populate the dataset.</p>`;
      return;
    }
    const data = judged.length ? judged : rows;
    el.innerHTML = data
      .map((r) => {
        const score =
          r.score == null ? "—" : `<span class="chip">${r.score.toFixed(2)}</span>`;
        return `
        <div class="eval-row">
          <div class="meta" style="margin-bottom:0.35rem">
            <span class="chip">#${r.id}</span>
            <span class="chip">${r.cluster || "unclustered"}</span>
            ${score}
            ${r.pass === true ? '<span class="chip citation">PASS</span>' : ""}
            ${r.pass === false ? '<span class="chip">FAIL</span>' : ""}
          </div>
          <p>${r.prompt}</p>
          ${r.rationale ? `<p style="margin-top:0.35rem">${r.rationale}</p>` : ""}
        </div>`;
      })
      .join("");
  }

  function updateMetrics(clusters) {
    Suite.$("evals-count").textContent = String(rows.length);
    Suite.$("evals-clusters").textContent = String(clusters?.length || 0);
    if (judged.length) {
      const avg = judged.reduce((a, b) => a + b.score, 0) / judged.length;
      const pass = judged.filter((j) => j.pass).length / judged.length;
      Suite.$("evals-avg").textContent = avg.toFixed(2);
      Suite.$("evals-pass").textContent = `${Math.round(pass * 100)}%`;
    } else {
      Suite.$("evals-avg").textContent = "—";
      Suite.$("evals-pass").textContent = "—";
    }
  }

  function drawCharts(clusters) {
    const clusterLabels = (clusters || []).map((c) => c.name);
    const clusterSizes = (clusters || []).map((c) => c.members.length);

    if (clusterChart) clusterChart.destroy();
    clusterChart = new Chart(Suite.$("evals-cluster-chart"), {
      type: "doughnut",
      data: {
        labels: clusterLabels.length ? clusterLabels : ["empty"],
        datasets: [
          {
            data: clusterSizes.length ? clusterSizes : [1],
            backgroundColor: [
              "#3ecf8e",
              "#5b9fd4",
              "#e8b84a",
              "#c084fc",
              "#f472b6",
              "#94a3b8",
            ],
          },
        ],
      },
      options: {
        plugins: { legend: { labels: { color: "#8b9bb0" } } },
      },
    });

    const scores = judged.length
      ? judged.map((j) => j.score)
      : rows.map((_, i) => 0.5 + (i % 5) * 0.05);
    if (scoreChart) scoreChart.destroy();
    scoreChart = new Chart(Suite.$("evals-score-chart"), {
      type: "line",
      data: {
        labels: (judged.length ? judged : rows).map((r) => `#${r.id}`),
        datasets: [
          {
            label: "Judge score",
            data: scores,
            borderColor: "#5b9fd4",
            backgroundColor: "rgba(91, 159, 212, 0.15)",
            fill: true,
            tension: 0.25,
          },
          {
            label: "Pass threshold",
            data: scores.map(() => 0.75),
            borderColor: "#e8b84a",
            borderDash: [6, 4],
            pointRadius: 0,
          },
        ],
      },
      options: {
        plugins: { legend: { labels: { color: "#8b9bb0" } } },
        scales: {
          x: { ticks: { color: "#8b9bb0" }, grid: { color: "#273244" } },
          y: {
            min: 0,
            max: 1,
            ticks: { color: "#8b9bb0" },
            grid: { color: "#273244" },
          },
        },
      },
    });
  }

  function onParse() {
    const t0 = performance.now();
    const text = Suite.$("evals-sql").value;
    parseLog(text);
    const clusters = clusterPrompts(rows);
    judged = [];
    updateMetrics(clusters);
    renderTable();
    drawCharts(clusters);
    Suite.setLatency(performance.now() - t0);
    Suite.bumpOps();
  }

  function onJudge() {
    if (!rows.length) onParse();
    const t0 = performance.now();
    judged = rows.map((r) => {
      const j = judge(r);
      return { ...r, ...j };
    });
    const clusters = clusterPrompts(rows);
    updateMetrics(clusters);
    renderTable();
    drawCharts(clusters);
    Suite.setLatency(performance.now() - t0);
    Suite.bumpOps();
  }

  function reset() {
    Suite.$("evals-sql").value = SAMPLE_LOG;
    rows = [];
    judged = [];
    updateMetrics([]);
    renderTable();
    drawCharts([]);
  }

  function init() {
    Suite.$("evals-sql").value = SAMPLE_LOG;
    Suite.$("evals-parse").addEventListener("click", onParse);
    Suite.$("evals-judge").addEventListener("click", onJudge);
    Suite.$("evals-reset").addEventListener("click", reset);
    onParse();
  }

  return { init };
})();
