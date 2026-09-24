import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicProposal, acceptPublicProposal } from '../../api/index.js';
import { formatMoney, formatDate, formatDateTime, statusColors, statusLabels } from '../../utils/format.js';

export default function PublicProposal() {
  const { token } = useParams();
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientName, setClientName] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicProposal(token)
      .then((data) => {
        setProposal(data);
        if (data.client?.name) setClientName(data.client.name);
      })
      .catch((err) => setError(err.message || 'Proposal link is invalid or expired'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setAccepting(true);
    setError('');
    try {
      const updated = await acceptPublicProposal(token, { clientName: clientName.trim() });
      setProposal((prev) => ({ ...prev, ...updated, status: 'accepted', acceptedAt: new Date() }));
      setSuccessMsg('Proposal accepted successfully! Your vendor has been notified.');
    } catch (err) {
      setError(err.message || 'Failed to accept proposal');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-xl w-full border border-stone-200 animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-1/3"></div>
          <div className="h-4 bg-stone-200 rounded w-1/2"></div>
          <div className="h-48 bg-stone-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-stone-200 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xl mx-auto mb-3 font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-stone-900">Proposal Unavailable</h1>
          <p className="text-xs text-stone-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const isAccepted = proposal.status === 'accepted';
  const lineItems = Array.isArray(proposal.lineItems) ? proposal.lineItems : [];

  return (
    <div className="min-h-screen bg-stone-100/60 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-stone-200/70 border border-stone-200 overflow-hidden">
        {/* Brand Banner Header */}
        <div className="p-6 sm:p-8 border-b border-stone-200 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {proposal.vendor?.logoUrl ? (
              <img
                src={proposal.vendor.logoUrl}
                alt={proposal.vendor.businessName}
                className="w-12 h-12 rounded-xl object-cover border border-stone-200"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-amber-800 text-white font-bold flex items-center justify-center text-xl shadow-sm">
                B
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-stone-900">{proposal.vendor?.businessName}</h2>
              <p className="text-xs text-stone-500">{proposal.vendor?.serviceType || 'Creative Professional'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${statusColors[proposal.status] || 'bg-stone-100'}`}>
              {statusLabels[proposal.status] || proposal.status}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest block mb-1">
              Proposal Document
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">{proposal.title}</h1>
            <p className="text-xs text-stone-500 mt-1">
              Prepared for <span className="font-semibold text-stone-800">{proposal.client?.name}</span> ({proposal.client?.email})
            </p>
          </div>

          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <span className="text-base">✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
              {error}
            </div>
          )}

          {/* Line items table */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Service Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3.5 px-4 font-medium text-stone-900">{item.description}</td>
                    <td className="py-3.5 px-4 text-center text-stone-600">{item.quantity}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-stone-600">{formatMoney(item.unitPaise)}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-stone-900">
                      {formatMoney(Number(item.quantity) * Number(item.unitPaise))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 bg-stone-50 rounded-xl p-4 space-y-2 text-xs border border-stone-200">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal:</span>
                <span className="font-mono">{formatMoney(proposal.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>GST ({Number(proposal.gstPercent)}%):</span>
                <span className="font-mono">
                  {formatMoney(Math.round(Number(proposal.subtotalPaise) * Number(proposal.gstPercent) / 100))}
                </span>
              </div>
              <div className="flex justify-between font-bold text-stone-900 pt-2 border-t border-stone-200 text-base">
                <span>Total:</span>
                <span className="font-mono text-amber-900">{formatMoney(proposal.totalPaise)}</span>
              </div>
            </div>
          </div>

          {proposal.notes && (
            <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-4 text-xs text-stone-700">
              <span className="font-bold text-amber-900 block mb-1">Deliverables & Scope Notes:</span>
              <p className="whitespace-pre-line leading-relaxed">{proposal.notes}</p>
            </div>
          )}

          {/* Action / Acceptance area */}
          <div className="pt-6 border-t border-stone-200">
            {isAccepted ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center space-y-1">
                <span className="text-2xl block text-emerald-700 font-bold">✓</span>
                <h3 className="text-sm font-bold text-emerald-950">Proposal Accepted</h3>
                <p className="text-xs text-emerald-800">
                  Accepted on {formatDateTime(proposal.acceptedAt)}. Your creative vendor will be in touch with next steps!
                </p>
              </div>
            ) : (
              <form onSubmit={handleAccept} className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Accept this Proposal</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Confirm your agreement to proceed with the services outlined above.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Your Full Name (Sign-off) *
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Rohan Verma"
                    className="w-full sm:max-w-md min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={accepting}
                  className="px-6 py-3 rounded-xl bg-amber-800 text-white text-xs font-bold hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
                >
                  {accepting ? 'Accepting…' : '✓ Accept Proposal'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 text-center text-xs text-stone-400">
          Powered securely by <span className="font-semibold text-stone-600">Bayana</span> · Client management for Indian creatives
        </div>
      </div>
    </div>
  );
}
