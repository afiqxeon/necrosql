# NecroSQL

**Nobody dares to rewrite 1998 SQL stored procedures.**

One wrong rounding mode and payroll is off by thousands of dollars. One missed NULL edge case and month-end billing crashes at 2 AM.

So those 2,000-line legacy SQL scripts sit untouched in production for decades—slow, untestable, and impossible to scale.

Everyone says, *"Just paste the SQL into an LLM and ask for TypeScript."*

**The catch?**

Native JavaScript floats turn 0.1 + 0.2 into 0.30000000000000004. LLMs silently swap ROUND_HALF_UP for ROUND_HALF_EVEN. Traditional unit tests with 5 hand-picked examples pass—while hidden edge cases quietly corrupt financial ledgers.

**So for Kiroween 2026 (Category: Resurrection), I built NecroSQL.**

NecroSQL does not guess. It extracts a deterministic **Abstract Syntax Tree (AST) & Control-Flow Graph** from dead legacy SQL, translates every branch into **Kiro EARS Specifications**, generates precision-safe **TypeScript (decimal.js + Zod)** microservices, and proves behavioral equivalence using **10,000+ Differential Property-Based Tests (fast-check)**.

Zero behavioral drift. Zero silent rounding bugs.

---

## How Kiro Powers NecroSQL

* **Spec-Driven Resurrection (.kiro/specs/):** Every legacy script is decomposed into formal EARS requirements (FR-01 through FR-05) before TypeScript code is generated.
* **Deterministic Steering Guardrails (.kiro/steering/):** Enforces decimal.js arbitrary-precision math and blocks native JS floating-point operators across all resurrected services.
* **Automated PBT Agent Hooks (.kiro/hooks/):** Every save inside packages/resurrected-services/ automatically triggers fast-check differential testing against the legacy SQL oracle.
* **Custom Slash Workflow (/resurrect-legacy):** Orchestrates AST extraction, EARS synthesis, service generation, and 10,000-run PBT verification in one command.
* **Custom MCP Server (packages/mcp-server):** Exposes extract_legacy_ast, run_legacy_oracle, and run_differential_pbt directly to Kiro.

---

## Quick Start (1-Command Docker)

```bash
git clone https://github.com/afiqxeon/necrosql.git
cd necrosql
docker compose up --build
```

Open the **Necromancy Lab Dashboard** at http://localhost:3001.
