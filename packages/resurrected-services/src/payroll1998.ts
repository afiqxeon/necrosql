import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Input validation schema mirroring sp_calc_payroll_1998 parameters.
 */
export const PayrollInputSchema = z.object({
  hours: z.union([z.string(), z.number()]),
  hourlyRate: z.union([z.string(), z.number()]),
  isHoliday: z.boolean(),
});

export type PayrollInput = z.infer<typeof PayrollInputSchema>;

export interface PayrollOutput {
  grossPay: string;
  taxWithheld: string;
  netPay: string;
}

/**
 * Precision-safe resurrected implementation of sp_calc_payroll_1998.
 * Strictly obeys NecroSQL Steering Guardrails: zero native JS float arithmetic.
 */
export function calculatePayrollResurrected(rawInput: PayrollInput): PayrollOutput {
  const input = PayrollInputSchema.parse(rawInput);

  const hours = new Decimal(input.hours);
  const hourlyRate = new Decimal(input.hourlyRate);

  if (hours.lte(0) || hourlyRate.lte(0)) {
    return {
      grossPay: "0.00",
      taxWithheld: "0.00",
      netPay: "0.00",
    };
  }

  const forty = new Decimal(40);
  const regularHours = hours.gt(forty) ? forty : hours;
  const overtimeHours = hours.gt(forty) ? hours.minus(forty) : new Decimal(0);
  const otMultiplier = input.isHoliday ? new Decimal("2.0") : new Decimal("1.5");

  const rawGross = regularHours
    .mul(hourlyRate)
    .plus(overtimeHours.mul(hourlyRate).mul(otMultiplier));

  const gross = rawGross.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  let taxRate: Decimal;
  if (gross.lte(new Decimal("500.00"))) {
    taxRate = new Decimal("0.10");
  } else if (gross.lte(new Decimal("1500.00"))) {
    taxRate = new Decimal("0.15");
  } else {
    taxRate = new Decimal("0.22");
  }

  const tax = gross.mul(taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const net = gross.minus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    grossPay: gross.toFixed(2),
    taxWithheld: tax.toFixed(2),
    netPay: net.toFixed(2),
  };
}

/**
 * Intentionally naive native-float implementation (for demo comparison).
 * Demonstrates how standard LLM translations fail under Property-Based Testing.
 */
export function calculatePayrollNaiveFloat(rawInput: PayrollInput): PayrollOutput {
  const hours = Number(rawInput.hours);
  const hourlyRate = Number(rawInput.hourlyRate);

  if (hours <= 0 || hourlyRate <= 0) {
    return { grossPay: "0.00", taxWithheld: "0.00", netPay: "0.00" };
  }

  const regularHours = hours > 40 ? 40 : hours;
  const overtimeHours = hours > 40 ? hours - 40 : 0;
  const otMultiplier = rawInput.isHoliday ? 2.0 : 1.5;

  const gross = Math.round(((regularHours * hourlyRate) + (overtimeHours * hourlyRate * otMultiplier)) * 100) / 100;

  let taxRate = 0.22;
  if (gross <= 500) taxRate = 0.10;
  else if (gross <= 1500) taxRate = 0.15;

  const tax = Math.round(gross * taxRate * 100) / 100;
  const net = Math.round((gross - tax) * 100) / 100;

  return {
    grossPay: gross.toFixed(2),
    taxWithheld: tax.toFixed(2),
    netPay: net.toFixed(2),
  };
}
