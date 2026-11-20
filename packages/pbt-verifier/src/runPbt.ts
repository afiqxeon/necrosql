import fc from "fast-check";
import { Pool } from "pg";
import {
  calculatePayrollResurrected,
  calculatePayrollNaiveFloat,
  type PayrollOutput,
} from "../../resurrected-services/src/payroll1998.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://necrosql:necrosql_password@legacy-db:5432/legacy_erp_1998";
const PBT_RUNS = Number(process.env.PBT_RUNS ?? "1000");
const TARGET_MODE = process.env.TARGET_MODE ?? "resurrected";

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Executes the authentic 1998 PostgreSQL stored procedure as the ground-truth oracle.
 */
async function queryLegacyOracle(
  hours: string,
  hourlyRate: string,
  isHoliday: boolean
): Promise<PayrollOutput> {
  const result = await pool.query(
    "SELECT gross_pay::text, tax_withheld::text, net_pay::text FROM sp_calc_payroll_1998($1::numeric, $2::numeric, $3::boolean)",
    [hours, hourlyRate, isHoliday]
  );
  const row = result.rows[0];
  return {
    grossPay: row.gross_pay,
    taxWithheld: row.tax_withheld,
    netPay: row.net_pay,
  };
}

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log(`NecroSQL Differential PBT Oracle | Mode: ${TARGET_MODE.toUpperCase()}`);
  console.log("Target Corpse: legacy-corpses/payroll_1998.sql (PostgreSQL 16)");
  console.log(`Scheduled Randomized Runs: ${PBT_RUNS}`);
  console.log("=================================================================");

  const serviceFn =
    TARGET_MODE === "naive"
      ? calculatePayrollNaiveFloat
      : calculatePayrollResurrected;

  let executed = 0;

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -500, max: 12000 }).map((n) => (n / 100).toFixed(2)),
        fc.integer({ min: -200, max: 15000 }).map((n) => (n / 100).toFixed(2)),
        fc.boolean(),
        async (hours, hourlyRate, isHoliday) => {
          executed++;
          const legacy = await queryLegacyOracle(hours, hourlyRate, isHoliday);
          const candidate = serviceFn({ hours, hourlyRate, isHoliday });

          if (
            legacy.grossPay !== candidate.grossPay ||
            legacy.taxWithheld !== candidate.taxWithheld ||
            legacy.netPay !== candidate.netPay
          ) {
            throw new Error(
              `BEHAVIORAL DRIFT DETECTED!\n` +
                `  Input     : hours=${hours}, hourlyRate=${hourlyRate}, isHoliday=${isHoliday}\n` +
                `  Legacy SQL: gross=${legacy.grossPay}, tax=${legacy.taxWithheld}, net=${legacy.netPay}\n` +
                `  TypeScript: gross=${candidate.grossPay}, tax=${candidate.taxWithheld}, net=${candidate.netPay}`
            );
          }
        }
      ),
      { numRuns: PBT_RUNS }
    );

    console.log(`\nPASS: ${executed}/${PBT_RUNS} differential PBT runs matched with 0.0000% drift!`);
  } catch (err) {
    console.error("\nFAIL: Differential PBT Oracle caught a shrunk counterexample:");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
