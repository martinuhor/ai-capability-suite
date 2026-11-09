# AI Capability Suite

100% client-side reference implementation of six enterprise AI patterns. No backend, no vector DB, no paid LLM API keys — open in a browser and demo the algorithms.

**Live demo:** https://ai-capability-suite.pages.dev/

## What it is

An interview / teaching / founder-demo dashboard that makes production AI concepts tangible:

| Module | Pattern | What you can show |
|--------|---------|-------------------|
| Hybrid RAG | Vector + BM25 + RRF | Retrieval quality + citations |
| Agent Orchestration | Plan → Act → Reflect + HITL | Safe tool-using agents |
| Semantic Cache | Cosine prompt interceptor | Cost & latency ROI |
| Evals & Benchmarks | Cluster + LLM-as-a-Judge | Quality gates before ship |
| LoRA Pipeline | r / α adapter sim | When RAG isn’t enough |
| Text-to-SQL | AST guardrails + sandbox | Block DROP/DELETE/UPDATE |

Press **▶ Demo Mode** (or `D`) for an ~8 minute interview coach with talking points.

## Who it serves

- **AI / ML engineers** interviewing for platform, RAG, or agent roles  
- **Founders & technical leads** pitching enterprise AI without burning API credits  
- **Educators / bootcamps** teaching retrieval, evals, and safety with live UI  
- **Nigerian / emerging-market teams** that need to demo architecture under FX, bandwidth, and funding constraints  

This is a **capability showcase and teaching tool**, not a hosted SaaS product for end customers.

## Run locally

```bash
# Option A
open index.html

# Option B (recommended — CDN fonts/charts)
python3 -m http.server 8080
# → http://localhost:8080
```

## Structure

```
├── index.html
├── css/styles.css
└── js/
    ├── app.js
    └── modules/
        ├── hybrid-rag.js
        ├── agent-system.js
        ├── semantic-cache.js
        ├── evals-evaluator.js
        ├── lora-pipeline.js
        ├── text-to-sql.js
        └── demo-mode.js
```

## Deploy

Static site — works on Cloudflare Pages, GitHub Pages, Netlify, or any static host.

```bash
npx wrangler pages deploy . --project-name=ai-capability-suite
```

## Honest scope

Algorithms (BM25, cosine, RRF, AST checks, agent loop, cache ROI, judge heuristics, LoRA curves) run locally in JavaScript. LoRA and “LLM-as-a-Judge” are faithful **simulators** of the UX and math — not GPU training or a frontier model API.
