# NecroSQL Requirements Specification (EARS Format)

## FR-01: Deterministic Legacy AST & Control-Flow Extraction
- **WHEN** a legacy SQL stored procedure or batch script is loaded from legacy-corpses/, **THE SYSTEM SHALL** parse its parameters, conditional branches (IF/ELSE/CASE), rounding rules, and arithmetic expressions into a structured JSON Abstract Syntax Tree (AST) and Control-Flow Graph (CFG).

## FR-02: EARS Business Rule Synthesis
- **WHEN** an AST representation is extracted for a legacy script, **THE SYSTEM SHALL** synthesize human-readable EARS requirements capturing every threshold, multiplier, and edge-case fallback before TypeScript code generation begins.

## FR-03: Precision-Safe TypeScript Service Generation
- **WHEN** generating a modern microservice in packages/resurrected-services/, **THE SYSTEM SHALL** enforce decimal.js arithmetic and strict Zod input validation schemas matching the legacy parameter types.

## FR-04: Differential Property-Based Testing (PBT) Oracle
- **WHEN** verifying a resurrected service, **THE SYSTEM SHALL** execute fast-check property-based tests generating extreme edge-case inputs (fractional cents .005, leap years, negative/zero boundaries, max hours) against both the Legacy SQL Oracle and the Resurrected TypeScript Service simultaneously, reporting any discrepancy as a minimal shrunk counterexample.

## FR-05: Real-Time Necromancy Lab Telemetry
- **WHEN** a PBT verification run completes or detects behavioral drift, **THE SYSTEM SHALL** stream the AST graph, shrunk counterexample trace, and equivalence score (0% to 100%) to the Necromancy Lab dashboard at localhost:3001.
