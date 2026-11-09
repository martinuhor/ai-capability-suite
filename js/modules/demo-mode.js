/**
 * Demo Mode — interview coach overlay with talking points + guided actions
 */
const DemoMode = (() => {
  const STEPS = [
    {
      id: "intro",
      module: "hybrid-rag",
      label: "Opening",
      time: "~20s",
      title: "Frame the story",
      doThis: [
        "Leave the dashboard open at localhost:8080",
        "Glance at the sidebar — six production AI patterns, zero cloud APIs",
      ],
      sayThis:
        "Everything here runs in the browser — no API keys — so I can walk you through the algorithms themselves, not a black-box SaaS demo.",
      tip: "Employers hire for systems thinking. Lead with patterns, then prove them live.",
      action: null,
    },
    {
      id: "rag",
      module: "hybrid-rag",
      label: "01 · RAG",
      time: "~90s",
      title: "Hybrid Search RAG",
      doThis: [
        "Keep the default auth / rate-limit query",
        "Click Run Hybrid Search (or use Run step below)",
        "Point at citations and the score breakdown chart",
      ],
      sayThis:
        "Pure vector search misses exact policy terms; pure BM25 misses paraphrase. Reciprocal Rank Fusion merges both rankings, then I reweight and cite sources — that’s how you reduce hallucinations in enterprise search.",
      tip: "Optional flex: drag Vector vs BM25 weights and re-run to show tradeoffs.",
      action: "rag-search",
    },
    {
      id: "agent",
      module: "agent-system",
      label: "02 · Agent",
      time: "~90s",
      title: "Agent Orchestration + HITL",
      doThis: [
        "Confirm Require HITL is checked",
        "Start Cycle",
        "When send_email appears — pause, narrate, then Approve",
      ],
      sayThis:
        "Agents without checkpoints are a liability. Sensitive tools — email, tickets — require human-in-the-loop. The graph is Plan → Act → Reflect, LangGraph-style, so every step is auditable.",
      tip: "Pause on the modal. Silence + the Approve button is the senior moment.",
      action: "agent-run",
    },
    {
      id: "cache",
      module: "semantic-cache",
      label: "03 · Cache",
      time: "~60s",
      title: "Semantic Caching ROI",
      doThis: [
        "Lookup the seeded prompt (expect a HIT)",
        "Point at Hit Rate, $ Saved, Latency Saved",
      ],
      sayThis:
        "Duplicate prompts are free money burned. Cosine similarity ≥ 0.85 returns a cached answer — I track dollars and milliseconds saved so finance can see ROI.",
      tip: "Change a few words and re-run to show a miss becoming a new cache entry.",
      action: "cache-lookup",
    },
    {
      id: "evals",
      module: "evals",
      label: "04 · Evals",
      time: "~60s",
      title: "Evals & LLM-as-a-Judge",
      doThis: [
        "Parse & Cluster is already loaded",
        "Run LLM-as-a-Judge",
        "Show cluster doughnut + score line vs 0.75 pass bar",
      ],
      sayThis:
        "You can’t ship what you can’t measure. I parse prompt logs, cluster intents, and score for relevance — regression charts catch quality drops before production.",
      tip: "Mention: same pattern as offline eval harnesses used in ML platform teams.",
      action: "evals-judge",
    },
    {
      id: "lora",
      module: "lora",
      label: "05 · LoRA",
      time: "~45s",
      title: "LoRA Fine-Tuning Pipeline",
      doThis: [
        "Leave r=8, α=16",
        "Start Training and watch the loss curves",
        "Preview Merge when the run finishes (or after a few epochs)",
      ],
      sayThis:
        "When RAG isn’t enough, you adapt the model. Rank and alpha control adapter size vs expressiveness; merge preview is W + (α/r)·B·A — what you’d ship to prod.",
      tip: "Be honest if asked: this is a faithful local simulator of the training UX and math, not GPU training.",
      action: "lora-start",
    },
    {
      id: "sql-safe",
      module: "text-to-sql",
      label: "06 · SQL ✓",
      time: "~45s",
      title: "Text-to-SQL — safe path",
      doThis: [
        "Generate SQL from the default NL question",
        "Execute in the sandbox",
        "Show the result table + green read-only guard",
      ],
      sayThis:
        "Natural language becomes SQL, but only after AST validation. Read-only SELECT runs in an isolated sandbox — never against production.",
      tip: "Confidence score is your bridge to ‘how sure is the generator?’",
      action: "sql-safe",
    },
    {
      id: "sql-block",
      module: "text-to-sql",
      label: "06 · SQL ✕",
      time: "~45s",
      title: "Text-to-SQL — mic drop",
      doThis: [
        "Swap NL to a destructive ask (auto-filled below)",
        "Generate → Validate / Execute",
        "Show the Blocked pill for DELETE",
      ],
      sayThis:
        "NL-to-SQL without guardrails will DROP your database. I parse an AST, block DROP, DELETE, UPDATE, INSERT — then refuse execution. Safety first.",
      tip: "End on this frame. Safety demos stick harder than feature lists.",
      action: "sql-block",
    },
    {
      id: "close",
      module: "hybrid-rag",
      label: "Close",
      time: "~20s",
      title: "Land the plane",
      doThis: [
        "Return to the sidebar overview",
        "Offer to open any js/modules/*.js file and walk the code",
      ],
      sayThis:
        "Same patterns as enterprise AI platforms — hybrid retrieval, agent graphs, caching, evals, fine-tuning, SQL safety — implemented so I can explain every layer without hiding behind a cloud API.",
      tip: "Ask: ‘Which of these matters most on your team?’ — turn the demo into a conversation.",
      action: null,
    },
  ];

  let stepIdx = 0;
  let open = false;

  function $(id) {
    return document.getElementById(id);
  }

  function click(id) {
    const el = $(id);
    if (el && !el.disabled) el.click();
  }

  function setValue(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function runAction(action) {
    switch (action) {
      case "rag-search":
        click("rag-search");
        break;
      case "agent-run":
        $("agent-hitl").checked = true;
        click("agent-run");
        break;
      case "cache-lookup":
        click("cache-lookup");
        break;
      case "evals-judge":
        click("evals-judge");
        break;
      case "lora-start":
        click("lora-start");
        break;
      case "sql-safe":
        setValue(
          "sql-nl",
          "Show average order value by region for customers who spent over $500."
        );
        click("sql-generate");
        setTimeout(() => click("sql-run"), 80);
        break;
      case "sql-block":
        setValue("sql-nl", "Delete customers who spent under 100");
        click("sql-generate");
        setTimeout(() => click("sql-run"), 80);
        break;
      default:
        break;
    }
  }

  function render() {
    const step = STEPS[stepIdx];
    const total = STEPS.length;
    $("demo-step-label").textContent = step.label;
    $("demo-step-time").textContent = step.time;
    $("demo-title").textContent = step.title;
    $("demo-progress-fill").style.width = `${((stepIdx + 1) / total) * 100}%`;
    $("demo-progress-text").textContent = `${stepIdx + 1} / ${total}`;

    $("demo-do").innerHTML = step.doThis.map((t) => `<li>${t}</li>`).join("");
    $("demo-say").textContent = step.sayThis;
    $("demo-tip").textContent = step.tip;

    $("demo-prev").disabled = stepIdx === 0;
    $("demo-next").textContent = stepIdx === total - 1 ? "Finish" : "Next";
    $("demo-run").disabled = !step.action;
    $("demo-run").textContent = step.action ? "Run this step" : "No auto-action";

    // Dot indicators
    $("demo-dots").innerHTML = STEPS.map(
      (s, i) =>
        `<button type="button" class="demo-dot${i === stepIdx ? " active" : ""}${i < stepIdx ? " done" : ""}" data-idx="${i}" aria-label="${s.label}"></button>`
    ).join("");

    Suite.switchModule(step.module);
  }

  function go(delta) {
    const next = stepIdx + delta;
    if (next < 0) return;
    if (next >= STEPS.length) {
      close();
      return;
    }
    stepIdx = next;
    render();
  }

  function jump(idx) {
    if (idx < 0 || idx >= STEPS.length) return;
    stepIdx = idx;
    render();
  }

  function openDemo() {
    open = true;
    stepIdx = 0;
    $("demo-coach").hidden = false;
    document.body.classList.add("demo-active");
    $("demo-launch").classList.add("active");
    render();
  }

  function close() {
    open = false;
    $("demo-coach").hidden = true;
    document.body.classList.remove("demo-active");
    $("demo-launch").classList.remove("active");
  }

  function init() {
    $("demo-launch").addEventListener("click", () => {
      if (open) close();
      else openDemo();
    });
    $("demo-close").addEventListener("click", close);
    $("demo-prev").addEventListener("click", () => go(-1));
    $("demo-next").addEventListener("click", () => go(1));
    $("demo-run").addEventListener("click", () => {
      const step = STEPS[stepIdx];
      if (step.action) runAction(step.action);
    });
    $("demo-dots").addEventListener("click", (e) => {
      const btn = e.target.closest(".demo-dot");
      if (!btn) return;
      jump(Number(btn.dataset.idx));
    });
    $("demo-copy").addEventListener("click", async () => {
      const text = STEPS[stepIdx].sayThis;
      try {
        await navigator.clipboard.writeText(text);
        $("demo-copy").textContent = "Copied";
        setTimeout(() => {
          $("demo-copy").textContent = "Copy line";
        }, 1200);
      } catch {
        $("demo-copy").textContent = "Select & copy";
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!open) {
        if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const tag = (e.target && e.target.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          openDemo();
        }
        return;
      }
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Enter" && !e.shiftKey) {
        const step = STEPS[stepIdx];
        if (step.action) {
          e.preventDefault();
          runAction(step.action);
        }
      }
    });
  }

  return { init, open: openDemo, close };
})();
