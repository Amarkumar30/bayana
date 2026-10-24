export default function Home() {
  return <main>
    <section className="hero">
      <div>
        <p className="eyebrow">A BETTER WAY TO BOOK</p>
        <h1>Your business, beautifully booked.</h1>
        <p>Give every client a clear, calm path from choosing a service to paying an advance. One link holds the details that matter.</p>
        <div className="hero-actions"><a className="button" href="/dashboard">Set up your page</a><a className="text-link" href="/auth?next=/dashboard">Sign in to your workspace</a></div>
        <div className="trust"><span>Secure email verification</span><span>Clear advance terms</span><span>Your policies, up front</span></div>
      </div>
      <aside className="hero-card" aria-label="Example booking summary">
        <div className="card-top"><span className="avatar">S</span><div><strong>Studio Sunday</strong><small>Event styling · Mumbai</small></div><span className="verified">OPEN</span></div>
        <div className="mini-calendar"><span>BOOKING</span><strong>24</strong><em>June · Available</em></div>
        <div className="card-total"><span>Design consultation<br />60 minutes</span><strong>₹2,500</strong></div>
      </aside>
    </section>
    <section className="feature-grid">
      <article><span>01</span><h2>Make the next step obvious</h2><p>Services, timing, policies and advance terms live together—so clients always know what to expect.</p></article>
      <article><span>02</span><h2>Build trust before payment</h2><p>Show a professional public page that makes a booking feel considered, not transactional.</p></article>
      <article><span>03</span><h2>Stay in control</h2><p>Save a draft, refine your offerings, then publish only when your booking page is ready.</p></article>
    </section>
  </main>;
}
