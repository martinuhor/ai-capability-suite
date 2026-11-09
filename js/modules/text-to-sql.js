/**
 * Text-to-SQL Guardrails — AST-style safety parser + in-browser sandbox
 */
const TextToSQL = (() => {
  const FORBIDDEN = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "CREATE", "REPLACE", "GRANT", "REVOKE"];

  // Lightweight in-memory relational sandbox
  const DB = {
    customers: [
      { id: 1, name: "Acme", region: "EMEA", spend: 820 },
      { id: 2, name: "Globex", region: "NA", spend: 1450 },
      { id: 3, name: "Initech", region: "APAC", spend: 390 },
      { id: 4, name: "Umbrella", region: "EMEA", spend: 610 },
      { id: 5, name: "Stark", region: "NA", spend: 2100 },
    ],
    orders: [
      { id: 101, customer_id: 1, amount: 120, region: "EMEA" },
      { id: 102, customer_id: 2, amount: 540, region: "NA" },
      { id: 103, customer_id: 2, amount: 310, region: "NA" },
      { id: 104, customer_id: 3, amount: 95, region: "APAC" },
      { id: 105, customer_id: 4, amount: 220, region: "EMEA" },
      { id: 106, customer_id: 5, amount: 880, region: "NA" },
      { id: 107, customer_id: 5, amount: 450, region: "NA" },
      { id: 108, customer_id: 1, amount: 260, region: "EMEA" },
    ],
  };

  let lastValidation = null;

  function schemaText() {
    return `customers(id, name, region, spend)
orders(id, customer_id, amount, region)`;
  }

  /**
   * sqlglot-style lightweight AST:
   * { type, tables, columns, where, groupBy, orderBy, limit, raw, blocked[] }
   */
  function parseSQL(sql) {
    const raw = String(sql || "").trim().replace(/\s+/g, " ");
    const upper = raw.toUpperCase();
    const blocked = FORBIDDEN.filter((kw) => new RegExp(`\\b${kw}\\b`).test(upper));

    const typeMatch = upper.match(/^\s*(WITH|SELECT|DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE)\b/);
    const type = typeMatch ? typeMatch[1] : "UNKNOWN";

    const tables = [];
    const fromMatch = upper.match(/\bFROM\s+([A-Z_][A-Z0-9_]*)/);
    if (fromMatch) tables.push(fromMatch[1].toLowerCase());
    const joinMatches = [...upper.matchAll(/\bJOIN\s+([A-Z_][A-Z0-9_]*)/g)];
    joinMatches.forEach((m) => tables.push(m[1].toLowerCase()));

    const selectMatch = raw.match(/SELECT\s+(.+?)\s+FROM/i);
    const columns = selectMatch
      ? selectMatch[1].split(",").map((c) => c.trim())
      : [];

    const whereMatch = raw.match(/\bWHERE\s+(.+?)(?:\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/i);
    const groupMatch = raw.match(/\bGROUP BY\s+(.+?)(?:\bORDER BY\b|\bLIMIT\b|$)/i);
    const orderMatch = raw.match(/\bORDER BY\s+(.+?)(?:\bLIMIT\b|$)/i);
    const limitMatch = upper.match(/\bLIMIT\s+(\d+)/);

    return {
      type,
      tables: [...new Set(tables)],
      columns,
      where: whereMatch ? whereMatch[1].trim() : null,
      groupBy: groupMatch ? groupMatch[1].trim() : null,
      orderBy: orderMatch ? orderMatch[1].trim() : null,
      limit: limitMatch ? Number(limitMatch[1]) : null,
      raw,
      blocked,
      readOnly: blocked.length === 0 && (type === "SELECT" || type === "WITH"),
    };
  }

  function confidenceFor(nl, ast) {
    let score = 0.55;
    if (ast.readOnly) score += 0.2;
    if (ast.tables.length) score += 0.1;
    if (/\b(average|avg|sum|count|region|customer|order)\b/i.test(nl)) score += 0.1;
    if (ast.blocked.length) score -= 0.45;
    if (ast.type === "UNKNOWN") score -= 0.2;
    return Math.max(0.05, Math.min(0.98, score));
  }

  function generateSQL(nl) {
    const q = nl.toLowerCase();
    // Pattern templates — fully local, no LLM API
    if (/drop|delete|update|insert|truncate/.test(q)) {
      // Intentionally emit a dangerous query so guardrails can demonstrate blocking
      if (q.includes("delete")) return "DELETE FROM customers WHERE spend < 100;";
      if (q.includes("update")) return "UPDATE orders SET amount = 0 WHERE region = 'APAC';";
      if (q.includes("drop")) return "DROP TABLE orders;";
      return "INSERT INTO customers (name, region, spend) VALUES ('Evil', 'NA', 0);";
    }

    if (/average|avg/.test(q) && /region/.test(q)) {
      if (/spend|spent|over|500/.test(q)) {
        return `SELECT o.region, AVG(o.amount) AS avg_order_value
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.spend > 500
GROUP BY o.region
ORDER BY avg_order_value DESC;`;
      }
      return `SELECT region, AVG(amount) AS avg_order_value
FROM orders
GROUP BY region
ORDER BY avg_order_value DESC;`;
    }

    if (/top|highest|spend/.test(q) && /customer/.test(q)) {
      return `SELECT name, region, spend
FROM customers
ORDER BY spend DESC
LIMIT 5;`;
    }

    if (/count|how many/.test(q) && /order/.test(q)) {
      return `SELECT region, COUNT(*) AS order_count
FROM orders
GROUP BY region
ORDER BY order_count DESC;`;
    }

    return `SELECT c.name, c.region, SUM(o.amount) AS total_amount
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.name, c.region
ORDER BY total_amount DESC;`;
  }

  function setGuardUI(ast, confidence) {
    const el = Suite.$("sql-guard");
    if (!ast) {
      el.innerHTML = `<div class="guard-pill idle">Awaiting validation</div>`;
      return;
    }
    if (ast.readOnly) {
      el.innerHTML = `<div class="guard-pill safe">✓ Read-only · safe to execute</div>`;
    } else {
      el.innerHTML = `<div class="guard-pill blocked">✕ Blocked · non-read-only operation</div>`;
    }
    Suite.$("sql-confidence").textContent = `${Math.round(confidence * 100)}%`;
    Suite.$("sql-stype").textContent = ast.type;
    Suite.$("sql-blocked").textContent = ast.blocked.length ? ast.blocked.join(", ") : "none";
  }

  function validate() {
    const nl = Suite.$("sql-nl").value;
    const sql = Suite.$("sql-query").value;
    const t0 = performance.now();
    const ast = parseSQL(sql);
    const confidence = confidenceFor(nl, ast);
    lastValidation = { ast, confidence };
    setGuardUI(ast, confidence);

    Suite.log("sql-log", `AST type=${ast.type} tables=[${ast.tables.join(", ")}]`, "info");
    Suite.log(
      "sql-log",
      `columns=${JSON.stringify(ast.columns)} where=${ast.where || "∅"} groupBy=${ast.groupBy || "∅"}`,
      "info"
    );
    if (ast.blocked.length) {
      Suite.log("sql-log", `Guardrail BLOCK · ${ast.blocked.join(", ")}`, "err");
    } else if (ast.readOnly) {
      Suite.log("sql-log", `Guardrail PASS · confidence=${confidence.toFixed(2)}`, "ok");
    } else {
      Suite.log("sql-log", "Guardrail FAIL · not a SELECT/WITH statement", "err");
    }

    Suite.setLatency(performance.now() - t0);
    Suite.bumpOps();
    return lastValidation;
  }

  // Minimal SQL executor for demo SELECT patterns against DB
  function execute(ast) {
    if (!ast.readOnly) {
      throw new Error(`Refused: ${ast.blocked.join(", ") || ast.type} is not allowed`);
    }

    const sql = ast.raw.toUpperCase();

    // AVG by region with optional spend filter
    if (sql.includes("AVG") && sql.includes("REGION") && sql.includes("GROUP BY")) {
      let orders = DB.orders;
      if (sql.includes("SPEND > 500") || sql.includes("SPEND>500")) {
        const rich = new Set(DB.customers.filter((c) => c.spend > 500).map((c) => c.id));
        orders = orders.filter((o) => rich.has(o.customer_id));
      }
      const groups = {};
      orders.forEach((o) => {
        groups[o.region] = groups[o.region] || [];
        groups[o.region].push(o.amount);
      });
      return Object.entries(groups).map(([region, amounts]) => ({
        region,
        avg_order_value: Number(
          (amounts.reduce((a, b) => a + b, 0) / amounts.length).toFixed(2)
        ),
      }));
    }

    if (sql.includes("COUNT(*)") && sql.includes("GROUP BY")) {
      const groups = {};
      DB.orders.forEach((o) => {
        groups[o.region] = (groups[o.region] || 0) + 1;
      });
      return Object.entries(groups).map(([region, order_count]) => ({ region, order_count }));
    }

    if (sql.includes("FROM CUSTOMERS") && sql.includes("ORDER BY SPEND")) {
      let rows = [...DB.customers].sort((a, b) => b.spend - a.spend);
      if (ast.limit) rows = rows.slice(0, ast.limit);
      return rows.map(({ name, region, spend }) => ({ name, region, spend }));
    }

    if (sql.includes("SUM") && sql.includes("JOIN")) {
      return DB.customers.map((c) => {
        const total = DB.orders
          .filter((o) => o.customer_id === c.id)
          .reduce((a, o) => a + o.amount, 0);
        return { name: c.name, region: c.region, total_amount: total };
      }).sort((a, b) => b.total_amount - a.total_amount);
    }

    // Fallback: dump orders
    return DB.orders.slice(0, ast.limit || 20);
  }

  function renderResults(rows) {
    const el = Suite.$("sql-results");
    if (!rows.length) {
      el.innerHTML = `<p class="muted">Query returned 0 rows.</p>`;
      return;
    }
    const cols = Object.keys(rows[0]);
    el.innerHTML = `
      <table>
        <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${cols.map((c) => `<td>${r[c]}</td>`).join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function onGenerate() {
    const nl = Suite.$("sql-nl").value.trim();
    if (!nl) {
      Suite.log("sql-log", "Empty natural language input", "warn");
      return;
    }
    const sql = generateSQL(nl);
    Suite.$("sql-query").value = sql;
    Suite.log("sql-log", "Generated SQL from NL template matcher", "ok");
    validate();
  }

  function onRun() {
    const result = validate();
    if (!result?.ast) return;
    try {
      const rows = execute(result.ast);
      renderResults(rows);
      Suite.log("sql-log", `Executed sandbox query · ${rows.length} rows`, "ok");
    } catch (err) {
      Suite.$("sql-results").innerHTML = `<p class="muted">${err.message}</p>`;
      Suite.log("sql-log", err.message, "err");
    }
  }

  function init() {
    Suite.$("sql-schema").textContent = schemaText();
    Suite.$("sql-generate").addEventListener("click", onGenerate);
    Suite.$("sql-validate").addEventListener("click", validate);
    Suite.$("sql-run").addEventListener("click", onRun);
    // Pre-generate for first paint
    onGenerate();
  }

  return { init, parseSQL };
})();
