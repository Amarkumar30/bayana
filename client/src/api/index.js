const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

let _accessToken = null;

export function setAccessToken(token) { _accessToken = token; }
export function getAccessToken() { return _accessToken; }

async function request(path, options = {}, retry = true) {
  const headers = { ...(options.headers || {}) };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let res = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const refreshed = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refreshed.ok) {
      const data = await refreshed.json();
      _accessToken = data.accessToken;
      headers['Authorization'] = `Bearer ${_accessToken}`;
      res = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
    } else {
      _accessToken = null;
      throw Object.assign(new Error('Session expired. Please log in again.'), { status: 401 });
    }
  }

  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.message || 'Request failed'), { status: res.status, data });
  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body });
const patch = (path, body) => request(path, { method: 'PATCH', body });
const del = (path) => request(path, { method: 'DELETE' });

// Auth
export const login = (body) => request('/auth/login', { method: 'POST', body });
export const signup = (body) => request('/auth/signup', { method: 'POST', body });
export const logout = () => request('/auth/logout', { method: 'POST' });

// Profile + Dashboard
export const getProfile = (vendorId) => get(`/vendors/${vendorId}/profile`);
export const updateProfile = (vendorId, body) => patch(`/vendors/${vendorId}/profile`, body);
export const getDashboard = (vendorId) => get(`/vendors/${vendorId}/dashboard`);

// Clients
export const listClients = (vendorId) => get(`/vendors/${vendorId}/clients`);
export const getClient = (vendorId, clientId) => get(`/vendors/${vendorId}/clients/${clientId}`);
export const createClient = (vendorId, body) => post(`/vendors/${vendorId}/clients`, body);
export const updateClient = (vendorId, clientId, body) => patch(`/vendors/${vendorId}/clients/${clientId}`, body);
export const deleteClient = (vendorId, clientId) => del(`/vendors/${vendorId}/clients/${clientId}`);

// Bookings
export const listBookings = (vendorId) => get(`/vendors/${vendorId}/bookings`);

// Proposals
export const listProposals = (vendorId) => get(`/vendors/${vendorId}/proposals`);
export const getProposal = (vendorId, proposalId) => get(`/vendors/${vendorId}/proposals/${proposalId}`);
export const createProposal = (vendorId, body) => post(`/vendors/${vendorId}/proposals`, body);
export const updateProposal = (vendorId, proposalId, body) => patch(`/vendors/${vendorId}/proposals/${proposalId}`, body);
export const sendProposal = (vendorId, proposalId) => post(`/vendors/${vendorId}/proposals/${proposalId}/send`, {});
export const deleteProposal = (vendorId, proposalId) => del(`/vendors/${vendorId}/proposals/${proposalId}`);

// Contracts
export const listContracts = (vendorId) => get(`/vendors/${vendorId}/contracts`);
export const getContract = (vendorId, contractId) => get(`/vendors/${vendorId}/contracts/${contractId}`);
export const createContract = (vendorId, body) => post(`/vendors/${vendorId}/contracts`, body);
export const sendContract = (vendorId, contractId) => post(`/vendors/${vendorId}/contracts/${contractId}/send`, {});
export const deleteContract = (vendorId, contractId) => del(`/vendors/${vendorId}/contracts/${contractId}`);

// Invoices
export const listInvoices = (vendorId) => get(`/vendors/${vendorId}/invoices`);
export const getInvoice = (vendorId, invoiceId) => get(`/vendors/${vendorId}/invoices/${invoiceId}`);
export const createInvoice = (vendorId, body) => post(`/vendors/${vendorId}/invoices`, body);
export const updateInvoice = (vendorId, invoiceId, body) => patch(`/vendors/${vendorId}/invoices/${invoiceId}`, body);
export const sendInvoice = (vendorId, invoiceId) => post(`/vendors/${vendorId}/invoices/${invoiceId}/send`, {});
export const markInvoicePaid = (vendorId, invoiceId, body) => post(`/vendors/${vendorId}/invoices/${invoiceId}/mark-paid`, body);
export const deleteInvoice = (vendorId, invoiceId) => del(`/vendors/${vendorId}/invoices/${invoiceId}`);

// Public portal (no auth)
export const getPublicVendor = (slug) => fetch(`${API}/public/vendors/${slug}`).then(r => r.json());
export const getAvailability = (slug, month) => fetch(`${API}/public/vendors/${slug}/availability?month=${month}`).then(r => r.json());
export const createPublicBooking = (slug, body) => fetch(`${API}/public/vendors/${slug}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const confirmPublicPayment = (bookingId, body) => fetch(`${API}/public/bookings/${bookingId}/confirm-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const getPublicProposal = (token) => fetch(`${API}/public/proposals/${token}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const acceptPublicProposal = (token, body) => fetch(`${API}/public/proposals/${token}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const getPublicContract = (token) => fetch(`${API}/public/contracts/${token}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const signPublicContract = (token, body) => fetch(`${API}/public/contracts/${token}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const getPublicInvoice = (token) => fetch(`${API}/public/invoices/${token}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const createInvoiceOrder = (token) => fetch(`${API}/public/invoices/${token}/order`, { method: 'POST' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
export const confirmInvoicePayment = (token, body) => fetch(`${API}/public/invoices/${token}/confirm-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; });
