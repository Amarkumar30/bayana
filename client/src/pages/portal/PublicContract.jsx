import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicContract, signPublicContract } from '../../api/index.js';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format.js';

export default function PublicContract() {
  const { token } = useParams();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedByName, setSignedByName] = useState('');
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [signing, setSigning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicContract(token)
      .then((data) => {
        setContract(data);
        if (data.clientName) setSignedByName(data.clientName);
      })
      .catch((err) => setError(err.message || 'Contract link is invalid or expired'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSign = async (e) => {
    e.preventDefault();
    if (!signedByName.trim() || !agreeChecked) return;
    setSigning(true);
    setError('');

    try {
      const updated = await signPublicContract(token, { signedByName: signedByName.trim() });
      setContract((prev) => ({
        ...prev,
        ...updated,
        acceptedAt: new Date(),
        signedByName: signedByName.trim(),
      }));
      setSuccessMsg('Contract signed and recorded successfully!');
    } catch (err) {
      setError(err.message || 'Failed to sign contract');
    } finally {
      setSigning(false);
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

  if (error && !contract) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-stone-200 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xl mx-auto mb-3 font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-stone-900">Contract Unavailable</h1>
          <p className="text-xs text-stone-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const isSigned = Boolean(contract.acceptedAt);

  return (
    <div className="min-h-screen bg-stone-100/60 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-stone-200/70 border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-stone-200 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {contract.vendor?.logoUrl ? (
              <img
                src={contract.vendor.logoUrl}
                alt={contract.businessName}
                className="w-12 h-12 rounded-xl object-cover border border-stone-200"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-amber-800 text-white font-bold flex items-center justify-center text-xl shadow-sm">
                B
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-stone-900">{contract.businessName}</h2>
              <p className="text-xs text-stone-500">{contract.vendor?.serviceType || 'Creative Vendor Agreement'}</p>
            </div>
          </div>

          <div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                isSigned
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {isSigned ? '✓ Legally Signed' : 'Pending Signature'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest block mb-1">
              Service Agreement & Contract
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Contract for {contract.clientName}
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Scheduled Event Date: <strong className="text-stone-800">{formatDate(contract.eventDate)}</strong>
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

          {/* Pricing cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-xs text-stone-500 block">Advance Deposit Requirement</span>
              <span className="text-xl font-bold font-mono text-stone-900 block mt-1">
                {formatMoney(contract.advanceAmountPaise)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-xs text-stone-500 block">Total Contract Package Value</span>
              <span className="text-xl font-bold font-mono text-stone-900 block mt-1">
                {formatMoney(contract.totalAmountPaise)}
              </span>
            </div>
          </div>

          {/* Agreement Terms */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
              Terms & Conditions
            </h2>
            <div className="p-5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700 font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
              {contract.terms}
            </div>
          </div>

          {/* Signature Box */}
          <div className="pt-6 border-t border-stone-200">
            {isSigned ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-2">
                <span className="text-2xl text-emerald-700 font-bold block">✓</span>
                <h3 className="text-base font-bold text-emerald-950">Contract Electronically Signed</h3>
                <p className="text-xs text-emerald-800">
                  Signed by <strong>{contract.signedByName || contract.clientName}</strong> on {formatDateTime(contract.acceptedAt)}.
                </p>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-2 inline-block px-4 py-1.5 bg-white border border-emerald-300 text-emerald-900 rounded-lg text-xs font-bold hover:bg-emerald-100"
                >
                  Print / Save as PDF
                </button>
              </div>
            ) : (
              <form onSubmit={handleSign} className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Sign & Accept Agreement</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    By typing your full legal name below, you confirm that you have read and agreed to the contract terms above.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Your Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={signedByName}
                    onChange={(e) => setSignedByName(e.target.value)}
                    placeholder="e.g. Priya Nair"
                    className="w-full sm:max-w-md min-h-[42px] rounded-xl border border-stone-300 bg-white px-3 text-xs outline-none focus:border-amber-800"
                  />
                </div>

                <label className="flex items-start gap-2 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreeChecked}
                    onChange={(e) => setAgreeChecked(e.target.checked)}
                    className="mt-0.5 rounded text-amber-800 focus:ring-amber-200"
                  />
                  <span>
                    I confirm that I am authorized to sign this agreement and accept all terms, policies, and pricing specified.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={signing || !agreeChecked || !signedByName.trim()}
                  className="px-6 py-3 rounded-xl bg-amber-800 text-white text-xs font-bold hover:bg-amber-900 transition shadow-sm disabled:opacity-50"
                >
                  {signing ? 'Signing contract…' : '✓ Sign & Accept Contract'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 text-center text-xs text-stone-400">
          Powered securely by <span className="font-semibold text-stone-600">Bayana</span> · Secure wedding & creative agreements
        </div>
      </div>
    </div>
  );
}
