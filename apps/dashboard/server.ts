import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { Pool } from "pg";
import { extractLegacyAst } from "../../packages/ast-extractor/src/index.js";
import {
  calculatePayrollResurrected,
  calculatePayrollNaiveFloat,
  type PayrollOutput,
} from "../../packages/resurrected-services/src/payroll1998.js";

const PORT = Number(process.env.PORT ?? "3001");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://necrosql:necrosql_password@legacy-db:5432/legacy_erp_1998";

const pool = new Pool({ connectionString: DATABASE_URL });

async function queryLegacyOracle(
  hours: string,
  hourlyRate: string,
  isHoliday: boolean,
): Promise<PayrollOutput> {
  const result = await pool.query(
    "SELECT gross_pay::text, tax_withheld::text, net_pay::text FROM sp_calc_payroll_1998($1::numeric, $2::numeric, $3::boolean)",
    [hours, hourlyRate, isHoliday],
  );
  const row = result.rows[0];
  return {
    grossPay: row.gross_pay,
    taxWithheld: row.tax_withheld,
    netPay: row.net_pay,
  };
}

async function runDifferentialPbt(mode: "naive" | "resurrected", runs: number) {
  const startedAt = Date.now();
  const serviceFn =
    mode === "naive" ? calculatePayrollNaiveFloat : calculatePayrollResurrected;

  let executed = 0;
  let counterexample: Record<string, unknown> | null = null;

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -500, max: 12000 }).map((n: number) => (n / 100).toFixed(2)),
        fc.integer({ min: -200, max: 15000 }).map((n: number) => (n / 100).toFixed(2)),
        fc.boolean(),
        async (hours: string, hourlyRate: string, isHoliday: boolean) => {
          executed++;
          const legacy = await queryLegacyOracle(hours, hourlyRate, isHoliday);
          const candidate = serviceFn({ hours, hourlyRate, isHoliday });

          if (
            legacy.grossPay !== candidate.grossPay ||
            legacy.taxWithheld !== candidate.taxWithheld ||
            legacy.netPay !== candidate.netPay
          ) {
            counterexample = {
              input: { hours, hourlyRate, isHoliday },
              legacySql: legacy,
              typeScript: candidate,
            };
            throw new Error("BEHAVIORAL_DRIFT_DETECTED");
          }
        },
      ),
      { numRuns: runs },
    );

    return {
      status: "PASSED",
      mode,
      scheduledRuns: runs,
      executedRuns: executed,
      equivalenceScore: "100.0000%",
      durationMs: Date.now() - startedAt,
      counterexample: null,
    };
  } catch {
    return {
      status: "DRIFT_DETECTED",
      mode,
      scheduledRuns: runs,
      executedRuns: executed,
      equivalenceScore: "FAILED (DRIFT)",
      durationMs: Date.now() - startedAt,
      counterexample,
    };
  }
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NecroSQL — Necromancy Lab Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen font-sans antialiased">
  <header class="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur sticky top-0 z-10">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🪦⚡</span>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-emerald-400">NecroSQL — Necromancy Lab</h1>
          <p class="text-xs text-zinc-400">Kiroween 2026 (Resurrection) | Live PostgreSQL 16 Oracle vs Precision-Safe TypeScript</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button onclick="runPbt('naive')" id="btn-naive" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-semibold transition">
          Run Naive Float PBT (Catch Bug)
        </button>
        <button onclick="runPbt('resurrected')" id="btn-resurrected" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition">
          Run Resurrected Decimal PBT (1,000 Runs)
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-6 space-y-6">
    <!-- Telemetry Banner -->
    <section id="pbt-banner" class="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold uppercase tracking-wider text-zinc-400">Differential PBT Oracle Telemetry</h2>
          <p id="pbt-status" class="text-lg font-bold text-zinc-200 mt-1">Ready. Click a verification button above to fire randomized edge-case inputs against PostgreSQL 16.</p>
        </div>
        <div class="text-right">
          <div class="text-xs text-zinc-400">Equivalence Score</div>
          <div id="pbt-score" class="text-2xl font-mono font-bold text-emerald-400">—</div>
        </div>
      </div>
      <pre id="pbt-detail" class="hidden mt-4 p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono overflow-x-auto text-amber-300"></pre>
    </section>

    <!-- Interactive Live Edge-Case Playground -->
    <section class="mb-6 rounded-xl border border-slate-800 bg-[#111827]/90 p-4">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Interactive Live Oracle Sandbox
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <label class="flex flex-col text-xs text-slate-300">
              <span class="mb-1 text-[11px] text-slate-400">Hours</span>
              <input
                id="inp-hours"
                type="text"
                value="35.80"
                class="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label class="flex flex-col text-xs text-slate-300">
              <span class="mb-1 text-[11px] text-slate-400">Hourly Rate ($)</span>
              <input
                id="inp-rate"
                type="text"
                value="17.69"
                class="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label class="mt-4 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                id="inp-holiday"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
              />
              <span>Holiday (2.0x OT)</span>
            </label>
            <button
              id="btn-compare-live"
              onclick="runSingleCompare()"
              class="mt-4 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Compare Live
            </button>
          </div>
        </div>

        <!-- Preset cepat 1-klik untuk Juri -->
        <div class="flex flex-wrap gap-2">
          <button
            onclick="applyPreset('35.80', '17.69', false)"
            class="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:border-rose-500 hover:text-white"
          >
            Preset: Float Drift Bug
          </button>
          <button
            onclick="applyPreset('45.50', '28.75', true)"
            class="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-white"
          >
            Preset: Holiday Overtime
          </button>
          <button
            onclick="applyPreset('-5', '20.00', false)"
            class="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:border-amber-500 hover:text-white"
          >
            Preset: Invalid Guard (≤ 0)
          </button>
        </div>
      </div>

      <!-- Hasil Perbandingan 3 Kolom -->
      <div id="live-compare-result" class="mt-4 hidden grid-cols-1 gap-3 border-t border-slate-800 pt-3 md:grid-cols-3">
        <div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs">
          <div class="mb-1 text-[11px] font-sans font-semibold text-amber-400">PostgreSQL 16 (Legacy Oracle)</div>
          <div id="res-oracle" class="text-slate-200"></div>
        </div>
        <div id="card-naive" class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs">
          <div class="mb-1 flex items-center justify-between font-sans text-[11px] font-semibold">
            <span class="text-slate-300">Naive JS Float</span>
            <span id="badge-naive"></span>
          </div>
          <div id="res-naive" class="text-slate-200"></div>
        </div>
        <div id="card-resurrected" class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs">
          <div class="mb-1 flex items-center justify-between font-sans text-[11px] font-semibold">
            <span class="text-emerald-400">Resurrected Decimal.js</span>
            <span id="badge-resurrected"></span>
          </div>
          <div id="res-resurrected" class="text-slate-200"></div>
        </div>
      </div>
    </section>

    <!-- 3-Column Comparison -->
    <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-amber-400">1. Corpse Code (1998 PL/pgSQL)</h3>
          <span class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">payroll_1998.sql</span>
        </div>
        <pre id="sql-source" class="text-xs font-mono text-zinc-300 bg-zinc-950 p-3 rounded-lg overflow-auto max-h-[460px] flex-1"></pre>
      </div>

      <div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-purple-400">2. Deterministic AST & EARS Spec</h3>
          <span id="ast-badge" class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">Loading...</span>
        </div>
        <div id="ast-content" class="space-y-3 overflow-auto max-h-[460px] flex-1 text-xs"></div>
      </div>

      <div class="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-emerald-400">3. Resurrected Service (Decimal.js + Zod)</h3>
          <span class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">payroll1998.ts</span>
        </div>
        <pre id="ts-source" class="text-xs font-mono text-zinc-300 bg-zinc-950 p-3 rounded-lg overflow-auto max-h-[460px] flex-1"></pre>
      </div>
    </section>
  </main>

  <script>
    async function loadWorkspace() {
      const res = await fetch('/api/workspace');
      const data = await res.json();
      document.getElementById('sql-source').textContent = data.ast.rawSource;
      document.getElementById('ts-source').textContent = data.tsSource;
      document.getElementById('ast-badge').textContent = data.ast.branches.length + ' CFG Branches | ' + data.ast.roundingOps.length + ' ROUND Ops';

      const astEl = document.getElementById('ast-content');
      astEl.innerHTML = '';

      const earsTitle = document.createElement('div');
      earsTitle.className = 'font-semibold text-purple-300 uppercase tracking-wider';
      earsTitle.textContent = 'Synthesized EARS Requirements';
      astEl.appendChild(earsTitle);

      data.ast.synthesizedEars.forEach(rule => {
        const card = document.createElement('div');
        card.className = 'p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono';
        card.textContent = rule;
        astEl.appendChild(card);
      });

      const cfgTitle = document.createElement('div');
      cfgTitle.className = 'font-semibold text-sky-300 uppercase tracking-wider pt-2';
      cfgTitle.textContent = 'Control-Flow Graph (CFG) Nodes';
      astEl.appendChild(cfgTitle);

      data.ast.branches.forEach(b => {
        const row = document.createElement('div');
        row.className = 'p-2 rounded bg-zinc-950 border border-zinc-800 flex justify-between font-mono';
        row.innerHTML = '<span class="text-sky-400">' + b.id + ' [' + b.type + ']</span><span class="text-zinc-300">' + b.condition + ' (L' + b.line + ')</span>';
        astEl.appendChild(row);
      });
    }

    async function runPbt(mode) {
      const statusEl = document.getElementById('pbt-status');
      const scoreEl = document.getElementById('pbt-score');
      const detailEl = document.getElementById('pbt-detail');

      statusEl.textContent = 'Running fast-check Differential PBT Oracle (' + mode.toUpperCase() + ') against PostgreSQL 16...';
      statusEl.className = 'text-lg font-bold text-amber-400 mt-1';
      scoreEl.textContent = '...';
      detailEl.classList.add('hidden');

      const res = await fetch('/api/pbt/run?mode=' + mode + '&runs=1000', { method: 'POST' });
      const data = await res.json();

      if (data.status === 'PASSED') {
        statusEl.textContent = 'PASS: ' + data.executedRuns + '/' + data.scheduledRuns + ' randomized runs matched PostgreSQL 16 with ZERO drift (' + data.durationMs + 'ms).';
        statusEl.className = 'text-lg font-bold text-emerald-400 mt-1';
        scoreEl.textContent = data.equivalenceScore;
        scoreEl.className = 'text-2xl font-mono font-bold text-emerald-400';
      } else {
        statusEl.textContent = 'DRIFT CAUGHT at run #' + data.executedRuns + '! fast-check isolated a shrunk counterexample (' + data.durationMs + 'ms).';
        statusEl.className = 'text-lg font-bold text-rose-400 mt-1';
        scoreEl.textContent = 'DRIFT';
        scoreEl.className = 'text-2xl font-mono font-bold text-rose-400';
        detailEl.textContent = JSON.stringify(data.counterexample, null, 2);
        detailEl.classList.remove('hidden');
      }
    }

    function applyPreset(hours, rate, isHoliday) {
      document.getElementById("inp-hours").value = hours;
      document.getElementById("inp-rate").value = rate;
      document.getElementById("inp-holiday").checked = isHoliday;
      runSingleCompare();
    }

    async function runSingleCompare() {
      const btn = document.getElementById("btn-compare-live");
      const resultBox = document.getElementById("live-compare-result");
      const hours = document.getElementById("inp-hours").value;
      const hourlyRate = document.getElementById("inp-rate").value;
      const isHoliday = document.getElementById("inp-holiday").checked;

      btn.disabled = true;
      btn.textContent = "Comparing...";

      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours, hourlyRate, isHoliday }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Comparison failed");

        const fmt = (o) => "Gross: $" + o.grossPay + " | Tax: $" + o.taxWithheld + " | Net: $" + o.netPay;
        document.getElementById("res-oracle").textContent = fmt(data.oracle);
        document.getElementById("res-naive").textContent = fmt(data.naive);
        document.getElementById("res-resurrected").textContent = fmt(data.resurrected);

        const naiveBadge = document.getElementById("badge-naive");
        const naiveCard = document.getElementById("card-naive");
        if (data.naiveDrift) {
          naiveBadge.innerHTML = '<span class="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-400">DRIFT</span>';
          naiveCard.className = "rounded-lg border border-rose-500/50 bg-rose-950/20 p-3 font-mono text-xs";
        } else {
          naiveBadge.innerHTML = '<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400">MATCH</span>';
          naiveCard.className = "rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs";
        }

        const resBadge = document.getElementById("badge-resurrected");
        const resCard = document.getElementById("card-resurrected");
        if (data.resurrectedDrift) {
          resBadge.innerHTML = '<span class="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-400">DRIFT</span>';
          resCard.className = "rounded-lg border border-rose-500/50 bg-rose-950/20 p-3 font-mono text-xs";
        } else {
          resBadge.innerHTML = '<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400">EXACT MATCH</span>';
          resCard.className = "rounded-lg border border-emerald-500/50 bg-emerald-950/20 p-3 font-mono text-xs";
        }

        resultBox.classList.remove("hidden");
        resultBox.classList.add("grid");
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Compare Live";
      }
    }

    loadWorkspace();
  </script>
</body>
</html>`;

const server = http.createServer(
  async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML_PAGE);
      return;
    }

    if (req.method === "GET" && url.pathname === "/styles.css") {
      const cssPath = path.resolve("apps/dashboard/public/styles.css");
      if (fs.existsSync(cssPath)) {
        const css = fs.readFileSync(cssPath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/css" });
        res.end(css);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
      return;
    }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    const ast = extractLegacyAst("legacy-corpses/payroll_1998.sql");
    const tsSource = fs.readFileSync(
      path.resolve("packages/resurrected-services/src/payroll1998.ts"),
      "utf-8",
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ast, tsSource }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/pbt/run") {
    const mode =
      url.searchParams.get("mode") === "naive" ? "naive" : "resurrected";
    const runs = Math.min(Number(url.searchParams.get("runs") ?? "1000"), 5000);
    const report = await runDifferentialPbt(mode, runs);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(report));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/compare") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}") as {
          hours?: string | number;
          hourlyRate?: string | number;
          isHoliday?: boolean;
        };

        const hours = String(parsed.hours ?? "35.80").trim();
        const hourlyRate = String(parsed.hourlyRate ?? "17.69").trim();
        const isHoliday = Boolean(parsed.isHoliday);

        // 1. Legacy Oracle (PostgreSQL 16)
        const pgRes = await pool.query(
          "SELECT gross_pay::text, tax_withheld::text, net_pay::text FROM sp_calc_payroll_1998($1::numeric, $2::numeric, $3::boolean)",
          [hours, hourlyRate, isHoliday],
        );
        const oracle = {
          grossPay: pgRes.rows[0].gross_pay as string,
          taxWithheld: pgRes.rows[0].tax_withheld as string,
          netPay: pgRes.rows[0].net_pay as string,
        };

        // 2. Naive JS Float (sesuaikan nama fungsi naive)
        const naive = calculatePayrollNaiveFloat({ hours, hourlyRate, isHoliday });

        // 3. Resurrected Decimal.js + Zod
        const resurrected = calculatePayrollResurrected({
          hours,
          hourlyRate,
          isHoliday,
        });

        const naiveDrift =
          naive.grossPay !== oracle.grossPay ||
          naive.taxWithheld !== oracle.taxWithheld ||
          naive.netPay !== oracle.netPay;

        const resurrectedDrift =
          resurrected.grossPay !== oracle.grossPay ||
          resurrected.taxWithheld !== oracle.taxWithheld ||
          resurrected.netPay !== oracle.netPay;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            input: { hours, hourlyRate, isHoliday },
            oracle,
            naive,
            resurrected,
            naiveDrift,
            resurrectedDrift,
          }),
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Invalid input";
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `NecroSQL Necromancy Lab Dashboard listening at http://localhost:${PORT}`,
  );
});
