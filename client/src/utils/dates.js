const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDateLike = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toDateTimeInputValue = (value) => {
  const date = parseDateLike(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

export const fromDateTimeInputValue = (value) => {
  if (!value) return '';
  const date = parseDateLike(value);
  if (!date) return value;
  return date.toISOString();
};

export const nowDateTimeInputValue = () => toDateTimeInputValue(new Date());

export const formatOsloDateTime = (value) => {
  const date = parseDateLike(value);
  if (!date) return value || '-';
  try {
    return new Intl.DateTimeFormat('no-NO', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  } catch (err) {
    return value || '-';
  }
};
