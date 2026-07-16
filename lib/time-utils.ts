

export const DAY_BOUNDARY_HOUR = 4;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;


export function getLogicalDay(now = new Date()) {
  const base = new Date(now);
  if (base.getHours() < DAY_BOUNDARY_HOUR) base.setDate(base.getDate() - 1);

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  const logicalDate = `${yyyy}-${mm}-${dd}`;

  const rangeStart = new Date(base);
  rangeStart.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  return { logicalDate, rangeStart, rangeEnd };
}

export function getLogicalDayForDate(dateString) {
  const match = typeof dateString === "string" ? dateString.match(DATE_RE) : null;
  if (!match) return getLogicalDay();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const rangeStart = new Date(year, month - 1, day, DAY_BOUNDARY_HOUR, 0, 0, 0);
  if (
    rangeStart.getFullYear() !== year
    || rangeStart.getMonth() !== month - 1
    || rangeStart.getDate() !== day
  ) {
    return getLogicalDay();
  }

  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  return { logicalDate: dateString, rangeStart, rangeEnd };
}


export function shiftLogicalDate(dateString, days) {
  const match = typeof dateString === "string" ? dateString.match(DATE_RE) : null;
  if (!match) return dateString;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + Number(days || 0));

  const yyyy = shifted.getFullYear();
  const mm = String(shifted.getMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
