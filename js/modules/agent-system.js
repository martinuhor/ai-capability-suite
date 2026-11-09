/**
 * Agent Orchestration — PLAN → ACT → REFLECT cyclic state graph + HITL
 */
const AgentSystem = (() => {
  const TOOLS = [
    { name: "web_search", desc: "Search internal knowledge", sensitive: false },
    { name: "read_docs", desc: "Retrieve policy documents", sensitive: false },
    { name: "draft_summary", desc: "Compose executive summary", sensitive: false },
    { name: "send_email", desc: "Send email to recipients", sensitive: true },
    { name: "write_ticket", desc: "Open change ticket", sensitive: true },
    { name: "query_finance_db", desc: "Read finance metrics", sensitive: false },
  ];

  let running = false;
  let step = 0;
  let hitlResolver = null;
  let timer = null;

  const plans = [
    "Decompose goal into research, synthesis, and delivery phases",
    "Identify required tools and data dependencies",
    "Sequence actions with HITL checkpoints for side-effects",
  ];

  function setState(name) {
    Suite.$("agent-state").textContent = name;
    document.querySelectorAll(".state-node").forEach((n) => {
      n.classList.toggle("active", n.dataset.state === name);
    });
  }

  function renderTools() {
    Suite.$("agent-tools").innerHTML = TOOLS.map(
      (t) => `
      <div class="tool-item">
        <div>
          <strong>${t.name}</strong>
          <p>${t.desc}</p>
        </div>
        ${t.sensitive ? '<span class="sensitive">HITL</span>' : '<span class="chip">safe</span>'}
      </div>`
    ).join("");
  }

  function trace(msg, level = "info") {
    Suite.log("agent-trace", msg, level);
  }

  function showHITL(tool, args) {
    return new Promise((resolve) => {
      hitlResolver = resolve;
      Suite.$("hitl-body").textContent =
        `The agent wants to invoke “${tool.name}”. Approve only if this side-effect is intended.`;
      Suite.$("hitl-payload").textContent = JSON.stringify({ tool: tool.name, args }, null, 2);
      Suite.$("hitl-modal").hidden = false;
    });
  }

  function hideHITL() {
    Suite.$("hitl-modal").hidden = true;
    hitlResolver = null;
  }

  function pickTool(stepIdx, goal) {
    const g = goal.toLowerCase();
    if (stepIdx === 1) return TOOLS.find((t) => t.name === "query_finance_db");
    if (stepIdx === 2) return TOOLS.find((t) => t.name === "read_docs");
    if (stepIdx === 3) return TOOLS.find((t) => t.name === "draft_summary");
    if (g.includes("email") || stepIdx >= 4) return TOOLS.find((t) => t.name === "send_email");
    return TOOLS[stepIdx % TOOLS.length];
  }

  async function runCycle() {
    const goal = Suite.$("agent-goal").value.trim();
    const maxSteps = Number(Suite.$("agent-max-steps").value) || 8;
    const requireHitl = Suite.$("agent-hitl").checked;

    if (!goal) {
      trace("Goal is empty", "warn");
      return;
    }

    running = true;
    step = 0;
    Suite.$("agent-run").disabled = true;
    Suite.$("agent-stop").disabled = false;
    Suite.clearLog("agent-trace");
    trace(`Goal accepted: ${goal}`, "ok");

    while (running && step < maxSteps) {
      step += 1;
      Suite.$("agent-step").textContent = String(step);
      Suite.bumpOps();

      // PLAN
      setState("PLAN");
      const plan = plans[(step - 1) % plans.length];
      trace(`PLAN · ${plan}`);
      await wait(420);

      if (!running) break;

      // ACT
      setState("ACT");
      const tool = pickTool(step, goal);
      const args = {
        goal_excerpt: goal.slice(0, 80),
        step,
        note: `Executing ${tool.name}`,
      };
      trace(`ACT · tool=${tool.name}`);

      if (tool.sensitive && requireHitl) {
        trace(`HITL required for ${tool.name}`, "warn");
        const approved = await showHITL(tool, args);
        if (!approved) {
          trace(`Denied ${tool.name} — reflecting alternate path`, "err");
          setState("REFLECT");
          await wait(350);
          continue;
        }
        trace(`Approved ${tool.name}`, "ok");
      }

      await wait(500);
      trace(`ACT · ${tool.name} completed`, "ok");

      if (!running) break;

      // REFLECT
      setState("REFLECT");
      const done = step >= Math.min(maxSteps, 5) && (!requireHitl || step > 4);
      const reflection = done
        ? "Outcome meets success criteria — terminating cycle"
        : "Partial progress — looping for next subgoal";
      trace(`REFLECT · ${reflection}`);
      await wait(380);

      if (done) {
        trace("Agent cycle complete", "ok");
        break;
      }
    }

    stop(false);
  }

  function wait(ms) {
    return new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
  }

  function stop(manual = true) {
    running = false;
    if (timer) clearTimeout(timer);
    Suite.$("agent-run").disabled = false;
    Suite.$("agent-stop").disabled = true;
    if (manual) {
      setState("IDLE");
      Suite.$("agent-state").textContent = "STOPPED";
      trace("Stopped by user", "warn");
    } else {
      setState("IDLE");
      Suite.$("agent-state").textContent = "DONE";
    }
    document.querySelectorAll(".state-node").forEach((n) => n.classList.remove("active"));
  }

  function init() {
    renderTools();
    setState("IDLE");
    Suite.$("agent-state").textContent = "IDLE";
    Suite.$("agent-run").addEventListener("click", () => {
      if (!running) runCycle();
    });
    Suite.$("agent-stop").addEventListener("click", () => stop(true));
    Suite.$("hitl-approve").addEventListener("click", () => {
      if (hitlResolver) hitlResolver(true);
      hideHITL();
    });
    Suite.$("hitl-deny").addEventListener("click", () => {
      if (hitlResolver) hitlResolver(false);
      hideHITL();
    });
  }

  return { init };
})();
