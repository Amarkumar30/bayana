import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listClients, createClient, updateClient, deleteClient } from '../api/index.js';
import { formatDate, statusColors, statusLabels } from '../utils/format.js';

const PIPELINE_STATUSES = [
  { key: 'all', label: 'All Clients' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'booked', label: 'Booked' },
  { key: 'completed', label: 'Completed' },
];

export default function Clients() {
  const { vendor } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    eventType: 'Wedding',
    eventDate: '',
    notes: '',
    status: 'new',
  });

  const loadClients = () => {
    if (!vendor?.id) return;
    setLoading(true);
    listClients(vendor.id)
      .then(setClients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClients();
  }, [vendor?.id]);

  const handleOpenAdd = () => {
    setForm({
      name: '',
      email: '',
      phone: '',
      eventType: 'Wedding Photography',
      eventDate: '',
      notes: '',
      status: 'new',
    });
    setEditingClient(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (client) => {
    setEditingClient(client);
    setForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      eventType: client.eventType || '',
      eventDate: client.eventDate ? client.eventDate.slice(0, 10) : '',
      notes: client.notes || '',
      status: client.status || 'new',
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        eventType: form.eventType || undefined,
        eventDate: form.eventDate || undefined,
        notes: form.notes || undefined,
        status: form.status,
      };

      if (editingClient) {
        await updateClient(vendor.id, editingClient.id, payload);
      } else {
        await createClient(vendor.id, payload);
      }
      setShowAddModal(false);
      loadClients();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (client, newStatus) => {
    try {
      await updateClient(vendor.id, client.id, { status: newStatus });
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, status: newStatus } : c))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (client) => {
    if (!window.confirm(`Are you sure you want to delete ${client.name}?`)) return;
    try {
      await deleteClient(vendor.id, client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      if (selectedClient?.id === client.id) setSelectedClient(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Filter & Search
  const filteredClients = clients.filter((c) => {
    const matchesFilter = activeFilter === 'all' || c.status === activeFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Client Pipeline</h1>
          <p className="text-sm text-stone-500">Track and manage couples & clients through every stage</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm self-start sm:self-auto"
        >
          <span>+</span>
          <span>Add New Client</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}

      {/* Pipeline tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-stone-200 pb-3">
        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
          {PIPELINE_STATUSES.map((status) => {
            const count =
              status.key === 'all'
                ? clients.length
                : clients.filter((c) => c.status === status.key).length;
            const active = activeFilter === status.key;
            return (
              <button
                key={status.key}
                type="button"
                onClick={() => setActiveFilter(status.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-amber-800 text-white shadow-sm'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                <span>{status.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active ? 'bg-amber-900 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64 min-h-[38px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {/* Clients List / Table */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-14 bg-stone-200 rounded-xl"></div>
          <div className="h-14 bg-stone-200 rounded-xl"></div>
          <div className="h-14 bg-stone-200 rounded-xl"></div>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <p className="text-stone-500 text-sm">No clients found matching this filter.</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-semibold hover:bg-amber-900"
          >
            + Add Client
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Event Details</th>
                  <th className="py-3 px-4">Stage / Pipeline</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-stone-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900 text-sm">{client.name}</div>
                      {client.notes && (
                        <p className="text-[11px] text-stone-400 truncate max-w-xs mt-0.5">{client.notes}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      <div>{client.email}</div>
                      {client.phone && <div className="text-stone-500 text-[11px]">{client.phone}</div>}
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      <div className="font-medium text-stone-900">{client.eventType || 'Event'}</div>
                      <div className="text-[11px] text-stone-500">{formatDate(client.eventDate)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={client.status}
                        onChange={(e) => handleStatusChange(client, e.target.value)}
                        className={`text-xs font-semibold py-1 px-2.5 rounded-full border outline-none cursor-pointer ${
                          statusColors[client.status] || 'bg-stone-100'
                        }`}
                      >
                        <option value="new">New Lead</option>
                        <option value="contacted">Contacted</option>
                        <option value="proposal_sent">Proposal Sent</option>
                        <option value="booked">Booked</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(client)}
                        className="px-2.5 py-1 rounded-lg text-amber-900 hover:bg-amber-50 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(client)}
                        className="px-2.5 py-1 rounded-lg text-rose-700 hover:bg-rose-50 font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-stone-200">
            <h2 className="text-lg font-bold text-stone-900 mb-1">
              {editingClient ? 'Edit Client Details' : 'Add New Client'}
            </h2>
            <p className="text-xs text-stone-500 mb-5">
              Enter client profile and event details to track them through your booking pipeline.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Client Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Pooja & Rohan"
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Event Type
                  </label>
                  <input
                    type="text"
                    value={form.eventType}
                    onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                    placeholder="e.g. Wedding Shoot"
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={form.eventDate}
                    onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                    className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Pipeline Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                >
                  <option value="new">New Lead</option>
                  <option value="contacted">Contacted</option>
                  <option value="proposal_sent">Proposal Sent</option>
                  <option value="booked">Booked</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Notes & Requirements
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Location, specific shot lists, package preferences..."
                  className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-800 text-white text-xs font-bold hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : editingClient ? 'Save Changes' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
