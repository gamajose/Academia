const DEFAULT_GRACE_DAYS = 10;

function toEpochDay(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / 86400000);
  }
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function calendarDaysLate(today, dueDate) {
  const todayDay = toEpochDay(today);
  const dueDay = toEpochDay(dueDate);
  if (todayDay == null || dueDay == null) return 0;
  return Math.max(0, todayDay - dueDay);
}

function evaluateAccess(input = {}) {
  const graceDays = Number.isInteger(input.graceDays) && input.graceDays >= 0
    ? input.graceDays
    : DEFAULT_GRACE_DAYS;
  const today = input.today || new Date();

  if (!input.memberActive) {
    return {
      allowed: false,
      status: 'blocked',
      reason: 'member_inactive',
      overdue_days: 0,
      grace_days: graceDays,
      message: 'Cadastro do aluno inativo.'
    };
  }

  if (input.membershipStatus !== 'active' || !input.membershipEndsAt) {
    return {
      allowed: false,
      status: 'blocked',
      reason: 'membership_inactive',
      overdue_days: 0,
      grace_days: graceDays,
      message: 'Matricula inativa ou inexistente.'
    };
  }

  const paymentOverdueDays = calendarDaysLate(today, input.oldestUnpaidDueDate);
  const membershipOverdueDays = calendarDaysLate(today, input.membershipEndsAt);
  const overdueDays = Math.max(paymentOverdueDays, membershipOverdueDays);

  if (overdueDays > graceDays) {
    const reason = paymentOverdueDays >= membershipOverdueDays
      ? 'payment_grace_expired'
      : 'membership_grace_expired';
    return {
      allowed: false,
      status: 'blocked',
      reason,
      overdue_days: overdueDays,
      grace_days: graceDays,
      message: `Acesso bloqueado: pendencia vencida ha ${overdueDays} dias.`
    };
  }

  if (overdueDays > 0) {
    return {
      allowed: true,
      status: 'grace_period',
      reason: paymentOverdueDays >= membershipOverdueDays
        ? 'payment_in_grace_period'
        : 'membership_in_grace_period',
      overdue_days: overdueDays,
      grace_days: graceDays,
      remaining_grace_days: graceDays - overdueDays,
      message: `Acesso liberado em carencia. Pendencia vencida ha ${overdueDays} dias.`
    };
  }

  return {
    allowed: true,
    status: 'current',
    reason: 'access_current',
    overdue_days: 0,
    grace_days: graceDays,
    message: 'Acesso liberado. Plano e mensalidade regulares.'
  };
}

module.exports = {
  DEFAULT_GRACE_DAYS,
  calendarDaysLate,
  evaluateAccess
};
