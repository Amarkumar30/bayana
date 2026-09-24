export const formatMoney = (paise) => {
  const amount = Number(paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
};

export const statusColors = {
  // Client statuses
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  contacted: 'bg-amber-100 text-amber-800 border-amber-200',
  proposal_sent: 'bg-purple-100 text-purple-800 border-purple-200',
  booked: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-stone-200 text-stone-700 border-stone-300',

  // Proposal statuses
  draft: 'bg-stone-100 text-stone-700 border-stone-300',
  sent: 'bg-amber-100 text-amber-800 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  declined: 'bg-rose-100 text-rose-800 border-rose-200',

  // Invoice statuses
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partially_paid: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  overdue: 'bg-rose-100 text-rose-800 border-rose-200',
  cancelled: 'bg-stone-200 text-stone-700 border-stone-300',

  // Booking statuses
  pending_payment: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  expired: 'bg-stone-200 text-stone-700 border-stone-300',
};

export const statusLabels = {
  new: 'New Lead',
  contacted: 'Contacted',
  proposal_sent: 'Proposal Sent',
  booked: 'Booked',
  completed: 'Completed',

  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',

  paid: 'Paid',
  partially_paid: 'Partial',
  overdue: 'Overdue',
  cancelled: 'Cancelled',

  pending_payment: 'Pending Hold',
  confirmed: 'Confirmed',
  expired: 'Expired',
};
