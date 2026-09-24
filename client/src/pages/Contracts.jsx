import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listContracts, listClients, createContract, sendContract, deleteContract } from '../api/index.js';
import { formatMoney, formatDate } from '../utils/format.js';

export default function Contracts() {
  const { vendor } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    eventDate: '',
    advanceAmount: '25000',
    totalAmount: '100000',
    terms: '',
  });

  const loadData = () => {
    if (!vendor?.id) return;
    setLoading(true);
    Promise.all([listContracts(vendor.id), listClients(vendor.id)])
      .then(([contractsData, clientsData]) => {
        setContracts(contractsData || []);
        setClients(clientsData || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [vendor?.id]);

  const handleOpenAdd = () => {
    const defaultClient = clients[0];
    setForm({
      clientId: defaultClient?.id || '',
      clientName: defaultClient?.name || '',
      eventDate: defaultClient?.eventDate ? defaultClient.eventDate.slice(0, 10) : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      advanceAmount: String(Number(vendor?.advanceAmountPaise || 2500000) / 100),
      totalAmount: String(Number(vendor?.totalAmountPaise || 10000000) / 100),
      terms:
        vendor?.terms ||
        '1. 50% non-refundable advance deposit secures the event date.\n2. Balance 50% due 7 days prior to the event.\n3. Turnaround time for raw and edited high-resolution media is 30 days.\n4. Force Majeure: Both parties agree to reschedule if prohibited by natural disasters or government orders.',
    });
    setShowModal(true);
  };

  const handleClientSelect = (clientId) => {
    const c = clients.find((client) => client.id === clientId);
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName: c ? c.name : prev.clientName,
      eventDate: c?.eventDate ? c.eventDate.slice(0, 10) : prev.eventDate,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId) {
      setError('Please select or add a client first.');
      return;
    }
    const advancePaise = Math.round(Number(form.advanceAmount) * 100);
    const totalPaise = Math.round(Number(form.totalAmount) * 100);

    if (totalPaise < advancePaise) {
      setError('Total amount must be greater than or equal to advance amount');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createContract(vendor.id, {
        clientId: form.clientId,
        clientName: form.clientName,
        eventDate: form.eventDate,
        advanceAmountPaise: advancePaise,
        totalAmountPaise: totalPaise,
        terms: form.terms,
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create contract');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (contract) => {
    try {
      await sendContract(vendor.id, contract.id);
      loadData();
      alert(`Contract signing link sent to client email!`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (contract) => {
    if (!window.confirm('Delete this contract?')) return;
    try {
      await deleteContract(vendor.id, contract.id);
      setContracts((prev) => prev.filter((c) => c.id !== contract.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyLink = (contract) => {
    const url = `${window.location.origin}/portal/contracts/${contract.publicToken}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(contract.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Contracts & Agreements</h1>
          <p className="text-sm text-stone-500">Legal agreements with public digital signature links</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm self-start sm:self-auto"
        >
          <span>+</span>
          <span>Create Contract</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-stone-200 rounded-xl"></div>
          <div className="h-16 bg-stone-200 rounded-xl"></div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <p className="text-stone-500 text-sm">No standalone contracts yet.</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold hover:bg-amber-900"
          >
            + Create your first contract
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Event Date</th>
                  <th className="py-3 px-4">Advance / Total</th>
                  <th className="py-3 px-4">Signature Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4 font-bold text-stone-900 text-sm">
                      {c.clientName}
                      {c.client?.email && (
                        <div className="text-[11px] font-normal text-stone-500">{c.client.email}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-stone-700">
                      {formatDate(c.eventDate)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                      <span>{formatMoney(c.advanceAmountPaise)}</span>
                      <span className="text-stone-400 font-normal text-[11px]"> / {formatMoney(c.totalAmountPaise)}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.acceptedAt ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ✓ Signed by {c.signedByName || 'Client'} ({formatDate(c.acceptedAt)})
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          Pending Signature
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(c)}
                        className="px-2.5 py-1 rounded-lg text-amber-900 hover:bg-amber-50 font-semibold"
                      >
                        {copiedId === c.id ? '✓ Copied' : 'Share Link'}
                      </button>
                      <a
                        href={`/portal/contracts/${c.publicToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg text-stone-600 hover:bg-stone-100 font-semibold inline-block"
                      >
                        Preview ↗
                      </a>
                      {!c.acceptedAt && (
                        <button
                          type="button"
                          onClick={() => handleSend(c)}
                          className="px-2.5 py-1 rounded-lg bg-amber-800 text-white hover:bg-amber-900 font-semibold"
                        >
                          Send Email
                        </button>
                      )}
                      {!c.acceptedAt && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="px-2.5 py-1 rounded-lg text-rose-700 hover:bg-rose-50 font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Contract Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-xl w-full shadow-2xl border border-stone-200 my-8">
            <h2 className="text-lg font-bold text-stone-900 mb-1">Create Contract Agreement</h2>
            <p className="text-xs text-stone-500 mb-5">
              Draft terms and advance requirements for client digital review and signature.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Select Client *
                </label>
                <select
                  required
                  value={form.clientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                >
                  <option value="">-- Choose a client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Contract Name / Client Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Event Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.eventDate}
                    onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Advance Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={form.advanceAmount}
                    onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Total Contract Value (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Contract Terms & Cancellation Policy *
                </label>
                <textarea
                  rows={5}
                  required
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs outline-none focus:border-amber-800 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-800 text-white text-xs font-bold hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Generate Contract Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
