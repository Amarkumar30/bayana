import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicInvoice, createInvoiceOrder, confirmInvoicePayment } from '../../api/index.js';
import { formatMoney, formatDate, formatDateTime, statusColors, statusLabels } from '../../utils/format.js';

export default function PublicInvoice() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicInvoice(token)
      .then(setInvoice)
      .catch((err) => setError(err.message || 'Invoice link is invalid or expired'))
      .finally(() => setLoading(false));
  }, [token]);

  const handlePay = async () => {
    if (!window.Razorpay) {
      setError('Razorpay checkout SDK is loading. Please check your internet connection and try again.');
      return;
    }
    setPaying(true);
    setError('');

    try {
      // Step 1: create order
      const orderData = await createInvoiceOrder(token);

      // Step 2: launch Razorpay Checkout modal
      const options = {
        key: orderData.razorpayKeyId,
        amount: orderData.amount,
        currency: 'INR',
        name: invoice.vendor?.businessName || 'Bayana Invoice',
        description: `Payment for ${invoice.invoiceNumber}`,
        order_id: orderData.orderId,
        handler: async (response) => {
          try {
            // Step 3: verify & confirm payment on server
            const confirmed = await confirmInvoicePayment(token, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setInvoice(confirmed);
            setSuccessMsg('Payment received successfully! Your receipt is generated below.');
          } catch (err) {
            setError(err.message || 'Payment confirmation failed. Please contact your vendor.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
        prefill: {
          name: invoice.client?.name || '',
          email: invoice.client?.email || '',
        },
        theme: {
          color: '#8a4b2a',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err.message || 'Failed to initiate payment');
      setPaying(false);
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

  if (error && !invoice) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-stone-200 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xl mx-auto mb-3 font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-stone-900">Invoice Unavailable</h1>
          <p className="text-xs text-stone-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const balancePaise = Math.max(0, Number(invoice.totalPaise) - Number(invoice.paidPaise || 0));
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  return (
    <div className="min-h-screen bg-stone-100/60 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-stone-200/70 border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-stone-200 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {invoice.vendor?.logoUrl ? (
              <img
                src={invoice.vendor.logoUrl}
                alt={invoice.vendor.businessName}
                className="w-12 h-12 rounded-xl object-cover border border-stone-200"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-amber-800 text-white font-bold flex items-center justify-center text-xl shadow-sm">
                B
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-stone-900">{invoice.vendor?.businessName}</h2>
              <p className="text-xs text-stone-500">{invoice.vendor?.serviceType || 'Creative Professional'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                statusColors[invoice.status] || 'bg-stone-100'
              }`}
            >
              {statusLabels[invoice.status] || invoice.status}
            </span>
          </div>
        </div>

        {/* Invoice Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-widest block mb-1">
                Tax Invoice
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 font-mono">
                {invoice.invoiceNumber}
              </h1>
              <p className="text-xs text-stone-500 mt-1">
                Billed to <strong className="text-stone-800">{invoice.client?.name}</strong> ({invoice.client?.email})
              </p>
            </div>

            <div className="text-left sm:text-right text-xs text-stone-500 space-y-1">
              <div>Invoice Date: <strong className="text-stone-700">{formatDate(invoice.createdAt)}</strong></div>
              <div>Due Date: <strong className="text-stone-700">{formatDate(invoice.dueDate)}</strong></div>
              {isPaid && (
                <div className="text-emerald-700 font-semibold">
                  Paid On: {formatDateTime(invoice.paidAt)}
                </div>
              )}
            </div>
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
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4 text-right">Total</th>
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

          {/* Summary Box */}
          <div className="flex justify-end">
            <div className="w-full sm:w-80 bg-stone-50 rounded-xl p-4 space-y-2 text-xs border border-stone-200">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal:</span>
                <span className="font-mono">{formatMoney(invoice.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>GST ({Number(invoice.gstPercent)}%):</span>
                <span className="font-mono">{formatMoney(invoice.gstAmountPaise)}</span>
              </div>
              <div className="flex justify-between font-bold text-stone-900 pt-2 border-t border-stone-200 text-sm">
                <span>Invoice Total:</span>
                <span className="font-mono">{formatMoney(invoice.totalPaise)}</span>
              </div>

              {Number(invoice.paidPaise) > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-stone-200">
                  <span>Paid so far:</span>
                  <span className="font-mono">{formatMoney(invoice.paidPaise)}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-amber-950 pt-2 border-t border-stone-300 text-base">
                <span>Balance Due:</span>
                <span className="font-mono">{formatMoney(balancePaise)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-4 text-xs text-stone-700">
              <span className="font-bold text-amber-900 block mb-1">Notes & Payment Terms:</span>
              <p className="whitespace-pre-line leading-relaxed">{invoice.notes}</p>
            </div>
          )}

          {/* Payment action section */}
          <div className="pt-6 border-t border-stone-200">
            {isPaid ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
                <span className="text-3xl text-emerald-700 font-bold block">✓</span>
                <h3 className="text-lg font-bold text-emerald-950">Invoice Paid in Full</h3>
                <p className="text-xs text-emerald-800">
                  Transaction completed on {formatDateTime(invoice.paidAt)}. Thank you for your payment!
                </p>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-3 inline-block px-4 py-2 bg-white border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 shadow-xs"
                >
                  Print / Download Receipt
                </button>
              </div>
            ) : (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center space-y-4">
                <div>
                  <h3 className="text-base font-bold text-stone-900">Pay Outstanding Balance</h3>
                  <p className="text-xs text-stone-500 mt-1">
                    Secure checkout powered by Razorpay. Supports UPI (Google Pay, PhonePe, Paytm), Credit & Debit cards, and Net Banking.
                  </p>
                </div>

                <div className="text-2xl font-bold font-mono text-amber-900">
                  {formatMoney(balancePaise)}
                </div>

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={paying || balancePaise <= 0}
                  className="w-full sm:max-w-md mx-auto min-h-[48px] rounded-xl bg-amber-800 text-white font-bold text-sm hover:bg-amber-900 transition shadow-sm disabled:opacity-50 block"
                >
                  {paying ? 'Opening secure checkout…' : `Pay ${formatMoney(balancePaise)} with UPI / Cards`}
                </button>

                <p className="text-[11px] text-stone-400">
                  🔒 Payments are 256-bit encrypted and processed by Razorpay Payments India.
                </p>
              </div>
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
