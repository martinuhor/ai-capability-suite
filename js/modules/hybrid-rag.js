/**
 * Hybrid RAG — BM25 + Vector cosine + Reciprocal Rank Fusion + rerank
 */
const HybridRAG = (() => {
  const DOCS = [
    {
      id: "DOC-01",
      title: "Authentication Policy",
      text: "Enterprise services require OAuth2 or SSO. API keys rotate every 90 days. MFA is mandatory for admin roles. Session tokens expire after 12 hours of inactivity.",
    },
    {
      id: "DOC-02",
      title: "Rate Limit Guidelines",
      text: "Standard tenants are limited to 120 requests per minute. Premium tiers allow 1000 RPM with burst credits. Exceeding limits returns HTTP 429 with Retry-After headers.",
    },
    {
      id: "DOC-03",
      title: "RAG Architecture Notes",
      text: "Hybrid retrieval combines dense vector search with BM25 sparse matching. Reciprocal Rank Fusion merges ranked lists. Citations must include source document IDs inline.",
    },
    {
      id: "DOC-04",
      title: "Data Retention",
      text: "Prompt logs are retained for 30 days in encrypted storage. PII is redacted before indexing. Customers may request deletion under GDPR within 14 business days.",
    },
    {
      id: "DOC-05",
      title: "Incident Response",
      text: "Severity-1 outages page the on-call within 5 minutes. Root cause analysis is due in 48 hours. Customer communications require legal review for security incidents.",
    },
    {
      id: "DOC-06",
      title: "Model Governance",
      text: "Production models require eval pass rates above 0.85. LoRA adapters must be reviewed before merge. Semantic cache thresholds default to 0.85 cosine similarity.",
    },
    {
      id: "DOC-07",
      title: "SQL Access Rules",
      text: "Text-to-SQL agents may only emit SELECT statements. DROP DELETE UPDATE and INSERT are blocked by AST guardrails. Queries run in an isolated SQLite sandbox.",
    },
    {
      id: "DOC-08",
      title: "Cost Controls",
      text: "Semantic caching reduces duplicate LLM spend. Estimated savings assume $0.002 per cached prompt and 800ms avoided latency per hit. Finance reviews weekly ROI dashboards.",
    },
  ];

  let index = null;
  let chart = null;

  function buildBM25(docs, k1 = 1.5, b = 0.75) {
    const N = docs.length;
    const df = new Map();
    const docLens = [];
    const tokenized = docs.map((d) => {
      const toks = Suite.Vec.tokenize(`${d.title} ${d.text}`);
      docLens.push(toks.length);
      const tf = new Map();
      toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      new Set(toks).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
      return tf;
    });
    const avgdl = docLens.reduce((a, b) => a + b, 0) / N;

    function score(query) {
      const q = Suite.Vec.tokenize(query);
      return docs.map((doc, i) => {
        const tf = tokenized[i];
        const dl = docLens[i];
        let s = 0;
        q.forEach((term) => {
          if (!tf.has(term)) return;
          const f = tf.get(term);
          const n = df.get(term) || 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl)));
        });
        return { doc, score: s, method: "bm25" };
      });
    }

    return { score };
  }

  function vectorSearch(docs, query) {
    const qv = Suite.Vec.embed(query);
    return docs.map((doc) => {
      const dv = Suite.Vec.embed(`${doc.title} ${doc.text}`);
      return { doc, score: Suite.Vec.cosine(qv, dv), method: "vector" };
    });
  }

  function rrf(rankLists, k = 60) {
    const fused = new Map();
    rankLists.forEach((list) => {
      list.forEach((item, rank) => {
        const id = item.doc.id;
        const contrib = 1 / (k + rank + 1);
        const prev = fused.get(id) || {
          doc: item.doc,
          rrf: 0,
          bm25: 0,
          vector: 0,
          sources: [],
        };
        prev.rrf += contrib;
        if (item.method === "bm25") prev.bm25 = item.score;
        if (item.method === "vector") prev.vector = item.score;
        prev.sources.push(item.method);
        fused.set(id, prev);
      });
    });
    return [...fused.values()].sort((a, b) => b.rrf - a.rrf);
  }

  function rerank(fused, query, vw, bw) {
    return fused
      .map((item) => {
        const hybrid =
          vw * item.vector + bw * Math.min(1, item.bm25 / 8) + 0.35 * item.rrf;
        return { ...item, hybrid };
      })
      .sort((a, b) => b.hybrid - a.hybrid);
  }

  function rebuildIndex() {
    index = {
      bm25: buildBM25(DOCS),
      docs: DOCS,
    };
    renderCorpus();
    Suite.log("rag-log", `Index rebuilt · ${DOCS.length} documents`, "ok");
  }

  function renderCorpus() {
    const el = Suite.$("rag-corpus");
    Suite.$("rag-doc-count").textContent = `${DOCS.length} docs`;
    el.innerHTML = DOCS.map(
      (d) => `
      <div class="doc-item">
        <h3>${d.id} · ${d.title}</h3>
        <p>${d.text.slice(0, 140)}…</p>
      </div>`
    ).join("");
  }

  function renderResults(ranked, topk, query) {
    const el = Suite.$("rag-results");
    const slice = ranked.slice(0, topk);
    if (!slice.length) {
      el.innerHTML = `<p class="muted">No matches for “${query}”.</p>`;
      return;
    }
    el.innerHTML = slice
      .map((r, i) => {
        const cite = `[${r.doc.id}]`;
        const snippet = r.doc.text.slice(0, 180);
        return `
        <div class="result-item">
          <h3>#${i + 1} ${r.doc.title}</h3>
          <p>${snippet}… <span class="chip citation">${cite}</span></p>
          <div class="meta">
            <span class="chip">hybrid ${r.hybrid.toFixed(3)}</span>
            <span class="chip">rrf ${r.rrf.toFixed(4)}</span>
            <span class="chip">vec ${r.vector.toFixed(3)}</span>
            <span class="chip">bm25 ${r.bm25.toFixed(3)}</span>
          </div>
        </div>`;
      })
      .join("");

    updateChart(slice);
  }

  function updateChart(slice) {
    const ctx = Suite.$("rag-chart");
    const labels = slice.map((r) => r.doc.id);
    const data = {
      labels,
      datasets: [
        {
          label: "Hybrid",
          data: slice.map((r) => r.hybrid),
          backgroundColor: "rgba(62, 207, 142, 0.65)",
        },
        {
          label: "Vector",
          data: slice.map((r) => r.vector),
          backgroundColor: "rgba(91, 159, 212, 0.55)",
        },
        {
          label: "BM25 (norm)",
          data: slice.map((r) => Math.min(1, r.bm25 / 8)),
          backgroundColor: "rgba(232, 184, 74, 0.5)",
        },
      ],
    };
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "bar",
      data,
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: "#8b9bb0" } } },
        scales: {
          x: { ticks: { color: "#8b9bb0" }, grid: { color: "#273244" } },
          y: { ticks: { color: "#8b9bb0" }, grid: { color: "#273244" }, beginAtZero: true },
        },
      },
    });
  }

  function search() {
    const t0 = performance.now();
    const query = Suite.$("rag-query").value.trim();
    const topk = Number(Suite.$("rag-topk").value) || 5;
    const vw = Number(Suite.$("rag-vw").value) / 100;
    const bw = Number(Suite.$("rag-bw").value) / 100;

    if (!query) {
      Suite.log("rag-log", "Empty query", "warn");
      return;
    }

    Suite.log("rag-log", `Query: “${query}” · vw=${vw.toFixed(2)} bw=${bw.toFixed(2)}`);

    const bm25All = index.bm25.score(query).sort((a, b) => b.score - a.score);
    const vecAll = vectorSearch(index.docs, query).sort((a, b) => b.score - a.score);

    const fused = rrf([
      bm25All.map((x) => ({ ...x, method: "bm25" })),
      vecAll.map((x) => ({ ...x, method: "vector" })),
    ]);
    const ranked = rerank(fused, query, vw, bw);
    renderResults(ranked, topk, query);

    const dt = performance.now() - t0;
    Suite.setLatency(dt);
    Suite.bumpOps();
    Suite.log(
      "rag-log",
      `RRF fused ${fused.length} docs · top=${ranked[0]?.doc.id || "n/a"} · ${dt.toFixed(1)}ms`,
      "ok"
    );
  }

  function bindSliders() {
    const sync = () => {
      Suite.$("rag-vw-val").textContent = (Number(Suite.$("rag-vw").value) / 100).toFixed(2);
      Suite.$("rag-bw-val").textContent = (Number(Suite.$("rag-bw").value) / 100).toFixed(2);
    };
    Suite.$("rag-vw").addEventListener("input", sync);
    Suite.$("rag-bw").addEventListener("input", sync);
    sync();
  }

  function init() {
    rebuildIndex();
    bindSliders();
    Suite.$("rag-search").addEventListener("click", search);
    Suite.$("rag-reindex").addEventListener("click", rebuildIndex);
  }

  return { init, search };
})();
