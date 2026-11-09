/**
 * AI Capability Suite — Application controller & tab router
 */
(function () {
  const META = {
    "hybrid-rag": {
      title: "Hybrid Search RAG",
      desc: "Vector embeddings + BM25 keyword matching fused via Reciprocal Rank Fusion",
    },
    "agent-system": {
      title: "Agent Orchestration",
      desc: "Cyclic state graph (PLAN → ACT → REFLECT) with tool registration and HITL",
    },
    "semantic-cache": {
      title: "Semantic Caching",
      desc: "Prompt vector lookup with configurable similarity threshold and ROI metrics",
    },
    evals: {
      title: "Automated Evals & Benchmarks",
      desc: "In-memory SQL log parsing, prompt clustering, and LLM-as-a-Judge scoring",
    },
    lora: {
      title: "LoRA Fine-Tuning Pipeline",
      desc: "Interactive r/α tuning, live loss streaming, and adapter merge preview",
    },
    "text-to-sql": {
      title: "Text-to-SQL Guardrails",
      desc: "AST safety parsing, confidence scoring, and in-browser SQLite sandbox",
    },
  };

  const state = {
    ops: 0,
    latencyMs: null,
    cacheHitRate: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function switchModule(name) {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.module === name);
    });
    document.querySelectorAll(".module-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${name}`);
    });
    const meta = META[name];
    if (meta) {
      $("module-title").textContent = meta.title;
      $("module-desc").textContent = meta.desc;
    }
  }

  function bumpOps(n = 1) {
    state.ops += n;
    $("g-ops").textContent = String(state.ops);
  }

  function setLatency(ms) {
    state.latencyMs = ms;
    $("g-latency").textContent = `${Math.round(ms)} ms`;
  }

  function setCacheHitRate(rate) {
    state.cacheHitRate = rate;
    $("g-cache").textContent = `${Math.round(rate * 100)}%`;
  }

  function log(elId, message, level = "info") {
    const el = $(elId);
    if (!el) return;
    const line = document.createElement("div");
    line.className = `log-line ${level}`;
    const ts = new Date().toLocaleTimeString();
    line.textContent = `[${ts}] ${message}`;
    el.prepend(line);
    while (el.children.length > 120) el.removeChild(el.lastChild);
  }

  function clearLog(elId) {
    const el = $(elId);
    if (el) el.innerHTML = "";
  }

  // Shared vector helpers used across modules
  const Vec = {
    tokenize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
    },
    // Deterministic bag-of-words embedding into fixed dims
    embed(text, dims = 48) {
      const vec = new Float64Array(dims);
      const tokens = this.tokenize(text);
      if (!tokens.length) return vec;
      tokens.forEach((tok, i) => {
        let h = 2166136261;
        for (let c = 0; c < tok.length; c++) {
          h ^= tok.charCodeAt(c);
          h = Math.imul(h, 16777619);
        }
        const idx = Math.abs(h) % dims;
        vec[idx] += 1 + (i % 3) * 0.15;
        vec[(idx + tok.length) % dims] += 0.35;
      });
      return this.normalize(vec);
    },
    normalize(v) {
      let n = 0;
      for (let i = 0; i < v.length; i++) n += v[i] * v[i];
      n = Math.sqrt(n) || 1;
      const out = new Float64Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
      return out;
    },
    cosine(a, b) {
      let s = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) s += a[i] * b[i];
      return s;
    },
  };

  window.Suite = {
    $,
    log,
    clearLog,
    bumpOps,
    setLatency,
    setCacheHitRate,
    Vec,
    switchModule,
  };

  document.getElementById("module-nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    switchModule(btn.dataset.module);
  });

  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", () => clearLog(btn.dataset.clear));
  });

  // Boot modules
  document.addEventListener("DOMContentLoaded", () => {
    HybridRAG.init();
    AgentSystem.init();
    SemanticCache.init();
    EvalsEvaluator.init();
    LoRAPipeline.init();
    TextToSQL.init();
    DemoMode.init();
    switchModule("hybrid-rag");
  });
})();
