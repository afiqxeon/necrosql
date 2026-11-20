-- ============================================================================
-- LEGACY STORED PROCEDURE: sp_calc_payroll_1998
-- Original System: ERP-98 Payroll Batch Engine (Circa 1998)
-- Semantics:
--   * Uses exact NUMERIC arithmetic with HALF_UP rounding (PostgreSQL default).
--   * Regular hours capped at 40.00; overtime (> 40) paid at 1.5x (or 2.0x on holidays).
--   * Progressive tax brackets: 10% (<= $500), 15% (<= $1500), 22% (> $1500).
--   * Non-positive hours or hourly rates immediately return 0.00.
-- ============================================================================

CREATE OR REPLACE FUNCTION sp_calc_payroll_1998(
    p_hours NUMERIC,
    p_hourly_rate NUMERIC,
    p_is_holiday BOOLEAN
)
RETURNS TABLE (
    gross_pay NUMERIC(12, 2),
    tax_withheld NUMERIC(12, 2),
    net_pay NUMERIC(12, 2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_regular_hours NUMERIC := 0;
    v_overtime_hours NUMERIC := 0;
    v_ot_multiplier NUMERIC := 1.5;
    v_gross NUMERIC := 0;
    v_tax_rate NUMERIC := 0.10;
    v_tax NUMERIC := 0;
    v_net NUMERIC := 0;
BEGIN
    -- Legacy guard: return zeroes for invalid or non-positive inputs
    IF p_hours IS NULL OR p_hourly_rate IS NULL OR p_hours <= 0 OR p_hourly_rate <= 0 THEN
        RETURN QUERY SELECT 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2);
        RETURN;
    END IF;

    IF p_hours > 40 THEN
        v_regular_hours := 40;
        v_overtime_hours := p_hours - 40;
    ELSE
        v_regular_hours := p_hours;
        v_overtime_hours := 0;
    END IF;

    IF p_is_holiday THEN
        v_ot_multiplier := 2.0;
    ELSE
        v_ot_multiplier := 1.5;
    END IF;

    v_gross := ROUND((v_regular_hours * p_hourly_rate) + (v_overtime_hours * p_hourly_rate * v_ot_multiplier), 2);

    IF v_gross <= 500.00 THEN
        v_tax_rate := 0.10;
    ELSIF v_gross <= 1500.00 THEN
        v_tax_rate := 0.15;
    ELSE
        v_tax_rate := 0.22;
    END IF;

    v_tax := ROUND(v_gross * v_tax_rate, 2);
    v_net := ROUND(v_gross - v_tax, 2);

    RETURN QUERY SELECT v_gross::NUMERIC(12, 2), v_tax::NUMERIC(12, 2), v_net::NUMERIC(12, 2);
END;
$$;
