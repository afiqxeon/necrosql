---
inclusion: always
---

# NecroSQL Deterministic Resurrection Guardrails

1. **Zero Native Floating-Point Arithmetic:** NEVER use native JavaScript number (+, -, *, /) for financial, tax, currency, or inventory calculations in packages/resurrected-services/. ALWAYS use Decimal from decimal.js with explicit rounding modes (Decimal.ROUND_HALF_UP or Decimal.ROUND_HALF_EVEN) matching the legacy SQL dialect.
2. **Mandatory EARS Specification First:** Before generating or modifying any service inside packages/resurrected-services/, an EARS-formatted requirement block (WHEN ... THE SYSTEM SHALL ...) must exist in .kiro/specs/necrosql-resurrection/requirements.md.
3. **Differential PBT Verification Gate:** A legacy script CANNOT be marked as "Resurrected" until it passes at least 1,000 randomized property-based test runs via packages/pbt-verifier (fast-check) with 0 behavioral drift against the legacy SQL oracle.
4. **Preserve Edge-Case Semantics:** Legacy quirks (leap-year day counts, holiday overtime multipliers, zero-division fallback values, or NULL handling) must be explicitly documented and preserved rather than silently altered.
5. **Professional English Code & Documentation Standard:** ALL generated source code, JSDoc/inline comments, variable/function identifiers, error messages, commit messages, and technical documentation MUST be written in clear, idiomatic, production-grade English.
