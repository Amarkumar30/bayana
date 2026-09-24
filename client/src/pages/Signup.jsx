import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    businessName: '',
    email: '',
    password: '',
    publicSlug: '',
    advanceAmount: '25000',
    totalAmount: '100000',
    terms: '50% advance required upon booking. Non-refundable within 30 days of the event.',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBusinessNameChange = (e) => {
    const val = e.target.value;
    const generatedSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
    setForm((prev) => ({
      ...prev,
      businessName: val,
      publicSlug: prev.publicSlug || generatedSlug,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const advancePaise = Math.round(Number(form.advanceAmount) * 100);
    const totalPaise = Math.round(Number(form.totalAmount) * 100);

    if (totalPaise < advancePaise) {
      setError('Total package amount must be greater than or equal to advance amount');
      setLoading(false);
      return;
    }

    try {
      await signup({
        businessName: form.businessName,
        email: form.email,
        password: form.password,
        publicSlug: form.publicSlug,
        advanceAmountPaise: advancePaise,
        totalAmountPaise: totalPaise,
        terms: form.terms,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try a different email or slug.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl shadow-stone-200/70 p-6 sm:p-8 border border-stone-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-800 text-white font-bold flex items-center justify-center text-xl mx-auto shadow-sm mb-3">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Create your Bayana account</h1>
          <p className="text-sm text-stone-500 mt-1">Start managing clients, proposals, and payments</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Business Name
            </label>
            <input
              type="text"
              required
              value={form.businessName}
              onChange={handleBusinessNameChange}
              className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
              placeholder="e.g. Pixel Crafters Studio"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Email address
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
                placeholder="contact@studio.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Password (min 12 chars)
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Public Booking URL Handle
            </label>
            <div className="flex items-center rounded-xl border border-stone-300 bg-stone-50 px-3 min-h-[44px] text-xs text-stone-500 focus-within:border-amber-800 focus-within:ring-2 focus-within:ring-amber-200">
              <span className="shrink-0 font-mono">bayana.in/book/</span>
              <input
                type="text"
                required
                pattern="^[a-z0-9-]{3,60}$"
                value={form.publicSlug}
                onChange={(e) => setForm({ ...form, publicSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full bg-transparent px-1 font-mono text-stone-900 outline-none text-xs"
                placeholder="my-studio"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Advance Amount (₹)
              </label>
              <input
                type="number"
                required
                min="100"
                value={form.advanceAmount}
                onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Full Package Amount (₹)
              </label>
              <input
                type="number"
                required
                min="100"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-xl bg-amber-800 text-white font-bold text-sm hover:bg-amber-900 transition shadow-sm disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating business account…' : 'Register business'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-stone-500">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-amber-800 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
