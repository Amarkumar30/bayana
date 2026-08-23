const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
async function request(path, options = {}) { const response = await fetch(`${API_URL}${path}`, options); const data = response.status === 204 ? null : await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'We could not complete that request. Please try again.'); return data; }
export const getVendor = (slug) => request(`/public/vendors/${slug}`);
export const getAvailability = (slug, month) => request(`/public/vendors/${slug}/availability?month=${month}`);
export const createBooking = (slug, input) => request(`/public/vendors/${slug}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export const confirmPayment = (bookingId, proof) => request(`/public/bookings/${bookingId}/confirm-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) });
export const getVendorBookings = (vendorId, token) => request(`/vendors/${vendorId}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
