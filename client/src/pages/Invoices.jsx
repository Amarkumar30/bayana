import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listInvoices, listClients, createInvoice, sendInvoice, markInvoicePaid, deleteInvoice } from '../api/index.js';
import { formatMoney, formatDate, statusColors, statusLabels } from '../utils/format.js';

export default function Invoices() {
  const { vendor } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Form state
  const [form, setForm] = useState({
    clientId: '',
    gstPercent: 18,
    dueDate: '',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitPriceRupees: 0 }],
  });

  const loadData = () => {
    if (!vendor?.id) return;
    setLoading(true);
    Promise.all([listInvoices(vendor.id), listClients(vendor.id)])
      .then(([invoicesData, clientsData]) => {
        setInvoices(invoicesData || []);
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
      gstPercent: 18,
      dueDate: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
      notes: 'Payment terms: Due on receipt. Bank transfer or UPI accepted via Razorpay.',
      lineItems: [
        { description: 'Event Booking Advance Retainer', quantity: 1, unitPriceRupees: 25000 },
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
      setError('Please select or add a client first.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        clientId: form.clientId,
        gstPercent: Number(form.gstPercent),
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
        lineItems: form.lineItems.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPaise: Math.round(Number(item.unitPriceRupees) * 100),
        })),
      };

      await createInvoice(vendor.id, payload);
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (invoice) => {
    try {
      await sendInvoice(vendor.id, invoice.id);
      loadData();
      alert(`Invoice payment link sent to ${invoice.client?.email || 'client'}!`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkPaid = async (invoice) => {
    if (!window.confirm(`Mark invoice ${invoice.invoiceNumber} as fully paid?`)) return;
    try {
      const updated = await markInvoicePaid(vendor.id, invoice.id, {});
      setInvoices((prev) => prev.map((inv) => (inv.id === invoice.id ? { ...inv, ...updated } : inv)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (invoice) => {
    if (!window.confirm('Delete this draft invoice?')) return;
    try {
      await deleteInvoice(vendor.id, invoice.id);
      setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyLink = (invoice) => {
    const url = `${window.location.origin}/portal/invoices/${invoice.publicToken}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(invoice.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Invoices & Payments</h1>
          <p className="text-sm text-stone-500">Create GST-compliant invoices and accept UPI / Card payments</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm self-start sm:self-auto"
        >
          <span>+</span>
          <span>Create Invoice</span>
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
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <p className="text-stone-500 text-sm">No invoices created yet.</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold hover:bg-amber-900"
          >
            + Create your first invoice
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-stone-900">{inv.client?.name}</div>
                      <div className="text-[11px] text-stone-500">{inv.client?.email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900 text-sm">
                      {formatMoney(inv.totalPaise)}
                    </td>
                    <td className="py-3.5 px-4 text-stone-500">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[inv.status] || 'bg-stone-100'}`}>
                        {statusLabels[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1 sm:space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(inv)}
                        className="px-2.5 py-1 rounded-lg text-amber-900 hover:bg-amber-50 font-semibold"
                      >
                        {copiedId === inv.id ? '✓ Copied' : 'Payment Link'}
                      </button>
                      <a
                        href={`/portal/invoices/${inv.publicToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg text-stone-600 hover:bg-stone-100 font-semibold inline-block"
                      >
                        Preview ↗
                      </a>
                      {inv.status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(inv)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-semibold shadow-xs"
                          title="Manually mark this invoice as received"
                        >
                          Mark Paid
                        </button>
                      )}
                      {inv.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleSend(inv)}
                          className="px-2.5 py-1 rounded-lg bg-amber-800 text-white hover:bg-amber-900 font-semibold"
                        >
                          Send Email
                        </button>
                      )}
                      {inv.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(inv)}
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

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl border border-stone-200 my-8">
            <h2 className="text-lg font-bold text-stone-900 mb-1">Create New Invoice</h2>
            <p className="text-xs text-stone-500 mb-5">
              Add services, set GST percent, and send a Razorpay payment link directly to your client.
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

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
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
                      placeholder="Item description (e.g. Wedding Shoot)"
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

              {/* GST */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  GST Rate
                </label>
                <select
                  value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) })}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                >
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST (Standard)</option>
                  <option value="28">28% GST</option>
                </select>
              </div>

              {/* Calculation summary box */}
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
                  <span>Invoice Total Due:</span>
                  <span className="font-mono text-amber-900">₹{totalRupees.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Payment Instructions & Notes
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
                  {submitting ? 'Generating…' : 'Generate Invoice & Payment Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
