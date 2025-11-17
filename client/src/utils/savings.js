export const SAVINGS_STORAGE_KEY = 'budsjett-savings-goals';

export const loadSavingsGoals = () => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(SAVINGS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error('Kunne ikke lese sparemål fra lagring', err);
    return [];
  }
};

export const saveSavingsGoals = (goals) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVINGS_STORAGE_KEY, JSON.stringify(goals));
  } catch (err) {
    console.error('Kunne ikke lagre sparemål', err);
  }
};

export const summarizeSavingsGoals = (goals = []) => {
  const totalTarget = goals.reduce((sum, goal) => sum + (Number(goal.targetAmount) || 0), 0);
  const totalSaved = goals.reduce((sum, goal) => sum + (Number(goal.savedAmount) || 0), 0);
  const completedCount = goals.filter((goal) => Number(goal.savedAmount) >= Number(goal.targetAmount) && goal.targetAmount > 0).length;
  const nextDeadline = goals
    .filter((goal) => goal.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  return {
    goalCount: goals.length,
    totalTarget,
    totalSaved,
    completedCount,
    avgProgress: totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0,
    nextDeadline: nextDeadline || null
  };
};
