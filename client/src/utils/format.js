export const formatCurrency = (value = 0) => {
  const amount = Number(value) || 0;
  return amount.toLocaleString('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
};

export const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('no-NO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(new Date(value));
  } catch (err) {
    return value;
  }
};

export const formatNotice = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return `${value} mnd`;
};
