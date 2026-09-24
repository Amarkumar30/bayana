import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: 'demo@bayana.in',
    password: 'DemonstrationPassword!1',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-stone-200/70 p-6 sm:p-8 border border-stone-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-800 text-white font-bold flex items-center justify-center text-xl mx-auto shadow-sm mb-3">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Sign in to Bayana</h1>
          <p className="text-sm text-stone-500 mt-1">Client relationship management for creative vendors</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full min-h-[46px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
              placeholder="you@domain.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full min-h-[46px] rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-amber-800 focus:ring-2 focus:ring-amber-200 transition"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] rounded-xl bg-amber-800 text-white font-bold text-sm hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-stone-500 space-y-2">
          <p>
            Demo credentials are pre-filled. Click <strong>Sign in</strong> to test.
          </p>
          <p>
            Don’t have an account?{' '}
            <Link to="/signup" className="font-semibold text-amber-800 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
