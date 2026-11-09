/**
 * LoRA Fine-Tuning Pipeline — 4-bit QLoRA simulator, live curves, adapters
 */
const LoRAPipeline = (() => {
  let training = false;
  let timer = null;
  let adapters = [];
  let chart = null;
  let trainSeries = [];
  let evalSeries = [];
  let labels = [];

  function selectedTargets() {
    return [...Suite.$("lora-targets").selectedOptions].map((o) => o.value);
  }

  function estimateAdapterMB(r, alpha, targets) {
    // Rough simulator: params ≈ 2 * r * hidden * modules (hidden~4096 toy)
    const hidden = 4096;
    const params = 2 * r * hidden * Math.max(1, targets.length);
    const bytes = params * 2; // fp16 adapter weights
    const mb = bytes / (1024 * 1024);
    const scale = alpha / Math.max(1, r);
    return { mb: mb * (0.35 + scale * 0.05), params };
  }

  function renderAdapters() {
    const el = Suite.$("lora-adapters");
    if (!adapters.length) {
      el.innerHTML = `<p class="muted">No adapters yet. Start a training run.</p>`;
      return;
    }
    el.innerHTML = adapters
      .map(
        (a) => `
      <div class="adapter-item">
        <h3>${a.name}</h3>
        <p>r=${a.r} · α=${a.alpha} · ${a.targets.join(", ")} · ${a.sizeMB.toFixed(2)} MB · loss ${a.finalLoss.toFixed(3)}</p>
        ${a.merged ? '<p class="chip citation">merge preview ready</p>' : ""}
      </div>`
      )
      .join("");
  }

  function ensureChart() {
    if (chart) return;
    chart = new Chart(Suite.$("lora-chart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "train_loss",
            data: trainSeries,
            borderColor: "#3ecf8e",
            tension: 0.25,
            pointRadius: 0,
          },
          {
            label: "eval_loss",
            data: evalSeries,
            borderColor: "#5b9fd4",
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        plugins: { legend: { labels: { color: "#8b9bb0" } } },
        scales: {
          x: { ticks: { color: "#8b9bb0", maxTicksLimit: 8 }, grid: { color: "#273244" } },
          y: { ticks: { color: "#8b9bb0" }, grid: { color: "#273244" } },
        },
      },
    });
  }

  function pushPoint(step, train, ev) {
    labels.push(String(step));
    trainSeries.push(train);
    evalSeries.push(ev);
    ensureChart();
    chart.data.labels = labels;
    chart.data.datasets[0].data = trainSeries;
    chart.data.datasets[1].data = evalSeries;
    chart.update("none");
  }

  function resetSeries() {
    labels = [];
    trainSeries = [];
    evalSeries = [];
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  async function start() {
    if (training) return;
    const r = Number(Suite.$("lora-r").value) || 8;
    const alpha = Number(Suite.$("lora-alpha").value) || 16;
    const lr = Number(Suite.$("lora-lr").value) || 2e-4;
    const epochs = Number(Suite.$("lora-epochs").value) || 5;
    const dropout = Number(Suite.$("lora-dropout").value) || 0.05;
    const targets = selectedTargets();

    if (!targets.length) {
      Suite.log("lora-log", "Select at least one target module", "warn");
      return;
    }

    training = true;
    Suite.$("lora-start").disabled = true;
    Suite.$("lora-stop").disabled = false;
    resetSeries();
    Suite.clearLog("lora-log");

    const { mb, params } = estimateAdapterMB(r, alpha, targets);
    Suite.$("lora-size").textContent = mb.toFixed(2);
    Suite.log(
      "lora-log",
      `QLoRA 4-bit sim · r=${r} α=${alpha} lr=${lr} dropout=${dropout} targets=[${targets.join(",")}] · ~${params.toLocaleString()} adapter params`,
      "ok"
    );

    let trainLoss = 2.4 + Math.random() * 0.3;
    let evalLoss = 2.55 + Math.random() * 0.25;
    let step = 0;
    const stepsPerEpoch = 12;

    for (let epoch = 1; epoch <= epochs && training; epoch++) {
      Suite.$("lora-epoch").textContent = String(epoch);
      Suite.log("lora-log", `Epoch ${epoch}/${epochs} begin`);

      for (let s = 1; s <= stepsPerEpoch && training; s++) {
        step += 1;
        const decay = Math.exp(-step / (epochs * stepsPerEpoch * 0.85));
        trainLoss = Math.max(0.18, trainLoss * 0.965 + (Math.random() - 0.48) * 0.04 * decay);
        evalLoss = Math.max(0.22, evalLoss * 0.972 + (Math.random() - 0.45) * 0.045 * decay);

        Suite.$("lora-loss").textContent = trainLoss.toFixed(3);
        Suite.$("lora-eval").textContent = evalLoss.toFixed(3);
        pushPoint(step, trainLoss, evalLoss);
        Suite.setLatency(12 + Math.random() * 8);
        Suite.bumpOps();

        await new Promise((resolve) => {
          timer = setTimeout(resolve, 90);
        });
      }

      Suite.log(
        "lora-log",
        `Epoch ${epoch} end · train=${trainLoss.toFixed(3)} eval=${evalLoss.toFixed(3)}`,
        "ok"
      );
    }

    if (training) {
      const adapter = {
        name: `adapter-r${r}-a${alpha}-${Date.now().toString(36).slice(-4)}`,
        r,
        alpha,
        targets,
        sizeMB: mb,
        finalLoss: trainLoss,
        merged: false,
      };
      adapters.unshift(adapter);
      renderAdapters();
      Suite.log("lora-log", `Saved ${adapter.name}`, "ok");
    }

    stop(false);
  }

  function stop(manual = true) {
    training = false;
    if (timer) clearTimeout(timer);
    Suite.$("lora-start").disabled = false;
    Suite.$("lora-stop").disabled = true;
    if (manual) Suite.log("lora-log", "Training stopped", "warn");
  }

  function previewMerge() {
    if (!adapters.length) {
      Suite.log("lora-log", "No adapter to merge", "warn");
      return;
    }
    const a = adapters[0];
    const scale = a.alpha / a.r;
    a.merged = true;
    renderAdapters();
    Suite.log(
      "lora-log",
      `Merge preview · W' = W + (α/r)·B·A · scale=${scale.toFixed(3)} · base + ${a.name}`,
      "ok"
    );
    Suite.bumpOps();
  }

  function init() {
    renderAdapters();
    Suite.$("lora-start").addEventListener("click", start);
    Suite.$("lora-stop").addEventListener("click", () => stop(true));
    Suite.$("lora-merge").addEventListener("click", previewMerge);
  }

  return { init };
})();
