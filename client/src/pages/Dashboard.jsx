import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard, listBookings } from '../api/index.js';
import { formatMoney, formatDate, formatDateTime, statusColors, statusLabels } from '../utils/format.js';

export default function Dashboard() {
  const { vendor } = useAuth();
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!vendor?.id) return;
    Promise.all([
      getDashboard(vendor.id).catch(() => ({
        totalClients: 0,
        pendingInvoiceCount: 0,
        pendingAmountPaise: 0,
        revenueThisMonthPaise: 0,
        activity: [],
      })),
      listBookings(vendor.id).catch(() => []),
    ])
      .then(([statsData, bookingsData]) => {
        setStats(statsData);
        setBookings(bookingsData || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vendor?.id]);

  const publicBookingUrl = `${window.location.origin}/book/${vendor?.publicSlug || 'bayana-studio'}`;

  const copyBookingLink = () => {
    navigator.clipboard?.writeText(publicBookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-stone-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-28 bg-stone-200 rounded-2xl"></div>
          <div className="h-28 bg-stone-200 rounded-2xl"></div>
          <div className="h-28 bg-stone-200 rounded-2xl"></div>
        </div>
        <div className="h-64 bg-stone-200 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome header & Public Link Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
            Welcome back, {vendor?.businessName || 'Partner'}
          </h1>
          <p className="text-sm text-stone-500 mt-1">Here is your studio’s latest pulse and client pipeline.</p>
        </div>

        {/* Public booking link share card */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5">
          <div className="text-xs">
            <span className="text-amber-900 font-semibold block">Your Public Booking Link:</span>
            <span className="font-mono text-stone-600 truncate max-w-[200px] block">/book/{vendor?.publicSlug}</span>
          </div>
          <button
            type="button"
            onClick={copyBookingLink}
            className="px-3 py-1.5 bg-amber-800 text-white font-semibold text-xs rounded-lg hover:bg-amber-900 transition shrink-0"
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 font-medium">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Total Clients</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-stone-900">{stats?.totalClients ?? 0}</span>
            <Link to="/clients" className="text-xs font-semibold text-amber-800 hover:underline">
              View pipeline →
            </Link>
          </div>
          <p className="text-xs text-stone-500 mt-1">Active leads & booked events</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Pending Invoices</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-amber-900">
              {formatMoney(stats?.pendingAmountPaise ?? 0)}
            </span>
            <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              {stats?.pendingInvoiceCount ?? 0} unpaid
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">Outstanding receivables</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Revenue This Month</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-950">
              {formatMoney(stats?.revenueThisMonthPaise ?? 0)}
            </span>
            <span className="text-xs font-semibold text-emerald-700">INR</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">Collected via Razorpay & marked paid</p>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/clients"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm"
        >
          <span>+</span>
          <span>Add Client</span>
        </Link>
        <Link
          to="/proposals"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-300 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 transition"
        >
          <span>+</span>
          <span>New Proposal</span>
        </Link>
        <Link
          to="/invoices"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-300 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 transition"
        >
          <span>+</span>
          <span>New Invoice</span>
        </Link>
        <Link
          to="/contracts"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-300 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 transition"
        >
          <span>+</span>
          <span>New Contract</span>
        </Link>
      </div>

      {/* Activity and Bookings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm lg:col-span-1">
          <h2 className="text-base font-bold text-stone-900 mb-4 flex items-center justify-between">
            <span>Recent Activity</span>
            <span className="text-xs font-normal text-stone-500">Live feed</span>
          </h2>

          {stats?.activity?.length ? (
            <div className="space-y-4">
              {stats.activity.map((act) => (
                <div key={`${act.type}-${act.id}`} className="flex items-start gap-3 text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-800 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 truncate">{act.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${statusColors[act.status] || 'bg-stone-100'}`}>
                        {statusLabels[act.status] || act.status}
                      </span>
                      <span className="text-stone-400 text-[10px]">{formatDateTime(act.at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-stone-400 text-xs">
              No recent activity yet. Create a client, proposal, or invoice to get started.
            </div>
          )}
        </div>

        {/* Confirmed & Pending Bookings Calendar list */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-stone-900">Upcoming Calendar Bookings</h2>
            <span className="text-xs text-stone-500">{bookings.length} registered dates</span>
          </div>

          {bookings.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 pr-4">Event Date</th>
                    <th className="py-2.5 px-4">Client</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 pl-4 text-right">Advance Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-stone-50/70 transition">
                      <td className="py-3 pr-4 font-semibold text-stone-900">
                        {formatDate(b.eventDate)}
                      </td>
                      <td className="py-3 px-4 text-stone-700">
                        <div>{b.clientName}</div>
                        <div className="text-[11px] text-stone-400">{b.clientEmail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[b.status] || 'bg-stone-100'}`}>
                          {statusLabels[b.status] || b.status}
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right font-mono font-bold text-stone-900">
                        {formatMoney(b.advanceAmountPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-stone-400 text-xs">
              No calendar bookings yet. Couples can book and pay advance via your public booking link!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
