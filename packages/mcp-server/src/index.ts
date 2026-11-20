import readline from "node:readline";
import { Pool } from "pg";
import { extractLegacyAst } from "../../ast-extractor/src/index.js";
import { calculatePayrollResurrected } from "../../resurrected-services/src/payroll1998.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://necrosql:necrosql_password@legacy-db:5432/legacy_erp_1998";

const pool = new Pool({ connectionString: DATABASE_URL });

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function sendResponse(id: string | number | undefined, result: unknown): void {
  if (id === undefined) return;
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: string | number | undefined, code: number, message: string): void {
  if (id === undefined) return;
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"
  );
}

const TOOLS = [
  {
    name: "extract_legacy_ast",
    description:
      "Deterministically extracts AST, Control-Flow Graph branches, rounding modes, and EARS rules from a legacy SQL file.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the legacy SQL file (default: legacy-corpses/payroll_1998.sql)",
        },
      },
    },
  },
  {
    name: "compare_single_execution",
    description:
      "Executes both the legacy PostgreSQL 16 stored procedure and the resurrected Decimal.js TypeScript service for a single input.",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "string" },
        hourlyRate: { type: "string" },
        isHoliday: { type: "boolean" },
      },
      required: ["hours", "hourlyRate", "isHoliday"],
    },
  },
];

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  try {
    if (req.method === "initialize") {
      sendResponse(req.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "necrosql-mcp-server", version: "1.0.0" },
      });
      return;
    }

    if (req.method === "tools/list") {
      sendResponse(req.id, { tools: TOOLS });
      return;
    }

    if (req.method === "tools/call") {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;

      if (name === "extract_legacy_ast") {
        const filePath = String(args.filePath ?? "legacy-corpses/payroll_1998.sql");
        const report = extractLegacyAst(filePath);
        sendResponse(req.id, {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        });
        return;
      }

      if (name === "compare_single_execution") {
        const hours = String(args.hours ?? "40.00");
        const hourlyRate = String(args.hourlyRate ?? "25.00");
        const isHoliday = Boolean(args.isHoliday ?? false);

        const dbRes = await pool.query(
          "SELECT gross_pay::text, tax_withheld::text, net_pay::text FROM sp_calc_payroll_1998($1::numeric, $2::numeric, $3::boolean)",
          [hours, hourlyRate, isHoliday]
        );
        const legacy = dbRes.rows[0];
        const resurrected = calculatePayrollResurrected({ hours, hourlyRate, isHoliday });

        const drift =
          legacy.gross_pay !== resurrected.grossPay ||
          legacy.tax_withheld !== resurrected.taxWithheld ||
          legacy.net_pay !== resurrected.netPay;

        sendResponse(req.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({ input: { hours, hourlyRate, isHoliday }, legacy, resurrected, drift }, null, 2),
            },
          ],
        });
        return;
      }

      sendError(req.id, -32601, `Unknown MCP tool: ${name}`);
      return;
    }

    sendError(req.id, -32601, `Method not found: ${req.method}`);
  } catch (err) {
    sendError(req.id, -32000, err instanceof Error ? err.message : String(err));
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line) as JsonRpcRequest;
    void handleRequest(req);
  } catch {
    sendError(undefined, -32700, "Parse error");
  }
});
