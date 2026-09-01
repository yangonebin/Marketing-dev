const parseInputDate = value => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toInputDate = date => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

export function getComparisonDateRange(startValue, endValue, preset) {
  const currentStart = parseInputDate(startValue);
  const currentEnd = parseInputDate(endValue);

  if (preset === 'last-year') {
    return {
      start: toInputDate(new Date(currentStart.getFullYear() - 1, currentStart.getMonth(), currentStart.getDate())),
      end: toInputDate(new Date(currentEnd.getFullYear() - 1, currentEnd.getMonth(), currentEnd.getDate())),
    };
  }

  const offsets = { 'previous-weekday': -7, 'previous-month-weekday': -28 };
  if (preset in offsets) {
    return {
      start: toInputDate(addDays(currentStart, offsets[preset])),
      end: toInputDate(addDays(currentEnd, offsets[preset])),
    };
  }

  const days = Math.max(1, Math.round((currentEnd - currentStart) / 86400000) + 1);
  const comparisonEnd = addDays(currentStart, -1);
  return {
    start: toInputDate(addDays(comparisonEnd, -(days - 1))),
    end: toInputDate(comparisonEnd),
  };
}
