import fs from "node:fs";
import path from "node:path";

export interface SqlParameter {
  name: string;
  dataType: string;
}

export interface ControlFlowBranch {
  id: string;
  type: "IF" | "ELSIF" | "ELSE";
  condition: string;
  line: number;
}

export interface RoundingOperation {
  expression: string;
  precision: number;
  line: number;
}

export interface LegacyAstReport {
  fileName: string;
  functionName: string;
  dialect: string;
  parameters: SqlParameter[];
  branches: ControlFlowBranch[];
  roundingOps: RoundingOperation[];
  synthesizedEars: string[];
  rawSource: string;
}

/**
 * Deterministically parses a legacy PL/pgSQL stored procedure into a structured
 * AST, Control-Flow Graph (CFG) summary, and synthesized EARS requirements.
 */
export function extractLegacyAst(filePath: string): LegacyAstReport {
  const absolutePath = path.resolve(filePath);
  const rawSource = fs.readFileSync(absolutePath, "utf-8");
  const lines = rawSource.split(/\r?\n/);

  const fnMatch = rawSource.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/i);
  const functionName = fnMatch ? fnMatch[1] : "unknown_procedure";
  const rawParams = fnMatch ? fnMatch[2] : "";

  const parameters: SqlParameter[] = rawParams
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paramLine) => {
      const parts = paramLine.split(/\s+/);
      return {
        name: parts[0] ?? "unknown",
        dataType: parts.slice(1).join(" ") || "UNKNOWN",
      };
    });

  const branches: ControlFlowBranch[] = [];
  const roundingOps: RoundingOperation[] = [];
  let branchCounter = 1;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNum = idx + 1;

    const ifMatch = trimmed.match(/^IF\s+(.+?)\s+THEN/i);
    if (ifMatch) {
      branches.push({
        id: `CFG-${branchCounter++}`,
        type: "IF",
        condition: ifMatch[1].trim(),
        line: lineNum,
      });
    }

    const elsifMatch = trimmed.match(/^ELSIF\s+(.+?)\s+THEN/i);
    if (elsifMatch) {
      branches.push({
        id: `CFG-${branchCounter++}`,
        type: "ELSIF",
        condition: elsifMatch[1].trim(),
        line: lineNum,
      });
    }

    if (/^ELSE\b/i.test(trimmed)) {
      branches.push({
        id: `CFG-${branchCounter++}`,
        type: "ELSE",
        condition: "FALLBACK_BRANCH",
        line: lineNum,
      });
    }

    const roundMatch = trimmed.match(/ROUND\((.+),\s*(\d+)\)/i);
    if (roundMatch) {
      roundingOps.push({
        expression: roundMatch[1].trim(),
        precision: Number(roundMatch[2]),
        line: lineNum,
      });
    }
  });

  const synthesizedEars = branches
    .filter((b) => b.type !== "ELSE")
    .map(
      (b, i) =>
        `EARS-0${i + 1}: WHEN (${b.condition}) is evaluated in ${functionName}, THE SYSTEM SHALL preserve exact legacy branch semantics at line ${b.line}.`
    );

  if (roundingOps.length > 0) {
    synthesizedEars.push(
      `EARS-ROUND: WHEN rounding monetary outputs (${roundingOps.length} ROUND calls detected), THE SYSTEM SHALL enforce Decimal.ROUND_HALF_UP with scale ${roundingOps[0].precision}.`
    );
  }

  return {
    fileName: path.basename(filePath),
    functionName,
    dialect: "PL/pgSQL (PostgreSQL 16 Legacy Oracle)",
    parameters,
    branches,
    roundingOps,
    synthesizedEars,
    rawSource,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? "legacy-corpses/payroll_1998.sql";
  console.log(JSON.stringify(extractLegacyAst(target), null, 2));
}
