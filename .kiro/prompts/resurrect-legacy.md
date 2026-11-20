---
description: Extract AST/CFG from a legacy SQL corpse, synthesize EARS rules, generate a Decimal-safe TypeScript service, and verify it with 10,000 fast-check Property-Based Tests.
---

You are the **NecroSQL Resurrection Engine**. Execute the following deterministic pipeline for the target legacy script specified by the user (default: legacy-corpses/payroll_1998.sql):

1. **Inspect & Extract AST:** Parse the legacy SQL file using packages/ast-extractor to identify all inputs, conditional branches, and rounding modes.
2. **Verify Guardrails:** Confirm .kiro/steering/resurrection-guardrails.md is active (decimal.js mandatory, zero native JS float math).
3. **Resurrect Service:** Generate or update the corresponding TypeScript module inside packages/resurrected-services/src/ with Zod schema validation.
4. **Run Differential PBT Oracle:** Execute npm run test:pbt (fast-check with 10,000 runs) comparing the Legacy SQL Oracle vs the Resurrected TypeScript Service. Report the exact equivalence score and any shrunk counterexamples caught.
