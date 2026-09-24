import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listProposals, listClients, createProposal, sendProposal, deleteProposal } from '../api/index.js';
import { formatMoney, formatDate, statusColors, statusLabels } from '../utils/format.js';

export default function Proposals() {
  const { vendor } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Form state
  const [form, setForm] = useState({
    clientId: '',
    title: '',
    gstPercent: 0,
    validUntil: '',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitPriceRupees: 0 }],
  });

  const loadData = () => {
    if (!vendor?.id) return;
    setLoading(true);
    Promise.all([listProposals(vendor.id), listClients(vendor.id)])
      .then(([proposalsData, clientsData]) => {
        setProposals(proposalsData || []);
        setClients(clientsData || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [vendor?.id]);

  const handleOpenAdd = () => {
    setForm({
      clientId: clients[0]?.id || '',
      title: 'Wedding Photography & Videography Package',
      gstPercent: 18,
      validUntil: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      notes: 'Includes full delivery of high-resolution digital negatives within 4 weeks.',
      lineItems: [
        { description: 'Full Day Event Coverage (2 Photographers)', quantity: 1, unitPriceRupees: 50000 },
        { description: '4K Cinematic Highlight Reel', quantity: 1, unitPriceRupees: 25000 },
      ],
    });
    setShowModal(true);
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { description: '', quantity: 1, unitPriceRupees: 0 }],
    }));
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const updated = [...prev.lineItems];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, lineItems: updated };
    });
  };

  // Live calculation
  const subtotalRupees = form.lineItems.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPriceRupees) || 0),
    0
  );
  const gstAmountRupees = Math.round((subtotalRupees * (Number(form.gstPercent) || 0)) / 100);
  const totalRupees = subtotalRupees + gstAmountRupees;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId) {
      setError('Please select or create a client first.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        clientId: form.clientId,
        title: form.title,
        gstPercent: Number(form.gstPercent),
        validUntil: form.validUntil || undefined,
        notes: form.notes || undefined,
        lineItems: form.lineItems.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPaise: Math.round(Number(item.unitPriceRupees) * 100),
        })),
      };

      await createProposal(vendor.id, payload);
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (proposal) => {
    try {
      await sendProposal(vendor.id, proposal.id);
      loadData();
      alert(`Proposal sent to ${proposal.client?.email || 'client'}!`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (proposal) => {
    if (!window.confirm('Are you sure you want to delete this draft proposal?')) return;
    try {
      await deleteProposal(vendor.id, proposal.id);
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyLink = (proposal) => {
    const url = `${window.location.origin}/portal/proposals/${proposal.publicToken}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(proposal.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Proposals</h1>
          <p className="text-sm text-stone-500">Send itemized estimates and let clients accept online</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm self-start sm:self-auto"
        >
          <span>+</span>
          <span>Create Proposal</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}

      {/* Proposals List */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-stone-200 rounded-xl"></div>
          <div className="h-16 bg-stone-200 rounded-xl"></div>
        </div>
      ) : proposals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <p className="text-stone-500 text-sm">No proposals created yet.</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold hover:bg-amber-900"
          >
            + Create your first proposal
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Title & Client</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Valid Until</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {proposals.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900 text-sm">{p.title}</div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        Client: <span className="font-semibold text-stone-700">{p.client?.name}</span> ({p.client?.email})
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900 text-sm">
                      {formatMoney(p.totalPaise)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[p.status] || 'bg-stone-100'}`}>
                        {statusLabels[p.status] || p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-stone-500">
                      {formatDate(p.validUntil)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(p)}
                        className="px-2.5 py-1 rounded-lg text-amber-900 hover:bg-amber-50 font-semibold"
                      >
                        {copiedId === p.id ? '✓ Copied' : 'Share Link'}
                      </button>
                      <a
                        href={`/portal/proposals/${p.publicToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg text-stone-600 hover:bg-stone-100 font-semibold inline-block"
                      >
                        Preview ↗
                      </a>
                      {p.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleSend(p)}
                          className="px-2.5 py-1 rounded-lg bg-amber-800 text-white hover:bg-amber-900 font-semibold"
                        >
                          Send Email
                        </button>
                      )}
                      {p.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
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

      {/* Create Proposal Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl border border-stone-200 my-8">
            <h2 className="text-lg font-bold text-stone-900 mb-1">Create Proposal</h2>
            <p className="text-xs text-stone-500 mb-5">
              Add itemized services, select applicable GST, and generate a client acceptance link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Select Client *
                  </label>
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  >
                    <option value="">-- Choose a client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Proposal Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Complete Wedding Cinematography"
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Line Items
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-semibold text-amber-800 hover:underline"
                  >
                    + Add Item
                  </button>
                </div>

                {form.lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Item description (e.g. Drone Shoots)"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="flex-1 min-h-[38px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                    />
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      className="w-16 min-h-[38px] rounded-xl border border-stone-300 bg-white px-2 text-xs outline-none focus:border-amber-800 text-center"
                    />
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-2.5 text-xs text-stone-400">₹</span>
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="Price"
                        value={item.unitPriceRupees}
                        onChange={(e) => handleItemChange(idx, 'unitPriceRupees', e.target.value)}
                        className="w-full min-h-[38px] rounded-xl border border-stone-300 bg-white pl-6 pr-2 text-xs outline-none focus:border-amber-800"
                      />
                    </div>
                    {form.lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-stone-400 hover:text-red-700 px-1 text-base"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* GST & Validity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    GST Rate
                  </label>
                  <select
                    value={form.gstPercent}
                    onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  >
                    <option value="0">0% (No GST)</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST (Standard)</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>
              </div>

              {/* Total Calculation summary box */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-1 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{subtotalRupees.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>GST ({form.gstPercent}%):</span>
                  <span className="font-mono">₹{gstAmountRupees.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-bold text-stone-900 pt-1 border-t border-amber-200 text-sm">
                  <span>Total Payable:</span>
                  <span className="font-mono text-amber-900">₹{totalRupees.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Deliverables & Terms Notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs outline-none focus:border-amber-800"
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
                  {submitting ? 'Generating…' : 'Create & Generate Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
