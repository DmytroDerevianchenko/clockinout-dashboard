// ============================================================
// payrollMath.ts — the phone's shared PayrollRunMath, ported line for line
// (shared/src/commonMain/kotlin/.../data/PayrollRunMath.kt). Keep the two in
// step: a rule changes there, it changes here the same day.
// ============================================================
export const CENT_EPSILON = 0.009;

/** Gross with the toggles applied. Holiday pay and its premium join before
 *  vacation, because vacation pay is owed on them too; the premium exists
 *  only when holiday pay itself is included. */
export function payrollGross(baseGross: number, suggestedOvertime: number, includeOvertime: boolean, vacationRate: number, includeVacation: boolean,
    suggestedHoliday = 0, includeHoliday = false, suggestedHolidayPremium = 0, includeHolidayPremium = false) {
    const ot   = includeOvertime ? suggestedOvertime : 0;
    const hol  = includeHoliday ? suggestedHoliday : 0;
    const prem = includeHoliday && includeHolidayPremium ? suggestedHolidayPremium : 0;
    const vac  = includeVacation ? (baseGross + ot + hol + prem) * vacationRate : 0;
    return { gross: baseGross + ot + hol + prem + vac, overtimePay: ot, vacationPay: vac, holidayPay: hol, holidayPremium: prem };
}

export const payrollTotalDeductions = (cpp: number, ei: number, ss: number, medicare: number, federal: number, provincial: number, other: number) =>
    cpp + ei + ss + medicare + federal + provincial + other;

export const payrollNetAmount = (isContractor: boolean, gross: number, gstHst: number, totalDeductions: number) =>
    isContractor ? gross + gstHst : gross - totalDeductions;

export const payrollGrossDrift = (gross: number, expected: number) => Math.abs(gross - expected) > CENT_EPSILON;

/** The switches differ from the org defaults this run would be born with →
 *  the run must be protected, or auto-calculate flips them back next load. */
export function payrollToggleDrift(overtimeOn: boolean, vacationOn: boolean, overtimeEnabled: boolean, suggestedOvertime: number, vacationEnabled: boolean, isUs: boolean,
    holidayOn = false, holidayPremiumOn = false, holidayEnabled = false, suggestedHoliday = 0, holidayPremiumEnabled = false, suggestedHolidayPremium = 0) {
    return overtimeOn !== (overtimeEnabled && suggestedOvertime > CENT_EPSILON)
        || vacationOn !== (vacationEnabled && !isUs)
        || holidayOn !== (holidayEnabled && suggestedHoliday > CENT_EPSILON)
        || (holidayOn && holidayPremiumOn) !== (holidayEnabled && holidayPremiumEnabled && suggestedHolidayPremium > CENT_EPSILON);
}

export const round2 = (v: number) => Math.round(v * 100 + 1e-7) / 100;
