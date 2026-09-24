import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getProfile, updateProfile } from '../api/index.js';

export default function Settings() {
  const { vendor, updateVendorState } = useAuth();
  const [form, setForm] = useState({
    businessName: '',
    serviceType: '',
    phone: '',
    location: '',
    logoUrl: '',
    advanceAmountRupees: '',
    totalAmountRupees: '',
    terms: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!vendor?.id) return;
    setLoading(true);
    getProfile(vendor.id)
      .then((data) => {
        setForm({
          businessName: data.businessName || '',
          serviceType: data.serviceType || 'Wedding services',
          phone: data.phone || '',
          location: data.location || '',
          logoUrl: data.logoUrl || '',
          advanceAmountRupees: String(Number(data.advanceAmountPaise || 0) / 100),
          totalAmountRupees: String(Number(data.totalAmountPaise || 0) / 100),
          terms: data.terms || '',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vendor?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedSuccess(false);

    const advancePaise = Math.round(Number(form.advanceAmountRupees) * 100);
    const totalPaise = Math.round(Number(form.totalAmountRupees) * 100);

    if (totalPaise < advancePaise) {
      setError('Total amount must be greater than or equal to advance amount');
      setSaving(false);
      return;
    }

    try {
      const updated = await updateProfile(vendor.id, {
        businessName: form.businessName,
        serviceType: form.serviceType,
        phone: form.phone || null,
        location: form.location || null,
        logoUrl: form.logoUrl || null,
        advanceAmountPaise: advancePaise,
        totalAmountPaise: totalPaise,
        terms: form.terms,
      });
      updateVendorState(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile settings');
    } finally {
      setSaving(false);
    }
  };

  const bookingLink = `${window.location.origin}/book/${vendor?.publicSlug || 'bayana-studio'}`;

  const copyBookingLink = () => {
    navigator.clipboard?.writeText(bookingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-stone-200 rounded w-1/4"></div>
        <div className="h-64 bg-stone-200 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Business Profile & Settings</h1>
        <p className="text-sm text-stone-500">Configure your studio details, branding, default pricing, and terms</p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <span>✓</span>
          <span>Your business settings have been successfully saved!</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}

      {/* Public Booking Link Card */}
      <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-amber-950">Your Public Booking Page</h2>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Share this link directly on Instagram, WhatsApp, or your website for clients to check dates and pay advance retainers.
          </p>
          <div className="font-mono text-xs text-stone-700 bg-white/70 px-3 py-1.5 rounded-lg border border-amber-200 mt-2 inline-block">
            {bookingLink}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copyBookingLink}
            className="px-4 py-2 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition shadow-sm"
          >
            {copied ? '✓ Copied Link' : 'Copy Booking Link'}
          </button>
          <a
            href={bookingLink}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-white text-stone-700 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-50 transition"
          >
            Open ↗
          </a>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Business Branding */}
          <div>
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4 border-b border-stone-100 pb-2">
              Branding & Contact Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Business / Studio Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Primary Service Type
                </label>
                <input
                  type="text"
                  value={form.serviceType}
                  onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                  placeholder="e.g. Wedding Photography & Films"
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Operating City / Location
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Bengaluru, India"
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Logo Image URL
                </label>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>
          </div>

          {/* Section: Default Package Pricing */}
          <div>
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-4 border-b border-stone-100 pb-2">
              Default Booking Package Pricing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Default Advance Retainer (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="100"
                  value={form.advanceAmountRupees}
                  onChange={(e) => setForm({ ...form, advanceAmountRupees: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
                <span className="text-[11px] text-stone-400 mt-1 block">Charged to lock dates on your public booking page.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Default Total Package Starting Price (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="100"
                  value={form.totalAmountRupees}
                  onChange={(e) => setForm({ ...form, totalAmountRupees: e.target.value })}
                  className="w-full min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200"
                />
                <span className="text-[11px] text-stone-400 mt-1 block">Total package reference displayed to clients.</span>
              </div>
            </div>
          </div>

          {/* Section: Default Terms */}
          <div>
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2 border-b border-stone-100 pb-2">
              Default Booking Terms & Cancellation Policy
            </h2>
            <textarea
              rows={5}
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
              placeholder="Cancellation rules, payment schedules, copyright terms..."
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 font-mono"
            />
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-stone-100">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-amber-800 text-white text-xs font-bold hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving changes…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
