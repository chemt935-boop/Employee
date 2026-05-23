function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmd(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseYearMonth(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

function payrollCycleForDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();

  if (day >= 26) {
    const start = new Date(y, m, 26);
    const end = new Date(y, m + 1, 25);
    return { start, end };
  }

  const start = new Date(y, m - 1, 26);
  const end = new Date(y, m, 25);
  return { start, end };
}

function payrollCycleForMonth(value) {
  const ym = parseYearMonth(value);
  if (!ym) return null;
  const start = new Date(ym.year, ym.monthIndex, 26);
  const end = new Date(ym.year, ym.monthIndex + 1, 25);
  return { start, end };
}

function daysInclusive(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

module.exports = {
  toYmd,
  parseYmd,
  parseYearMonth,
  payrollCycleForDate,
  payrollCycleForMonth,
  daysInclusive
};
