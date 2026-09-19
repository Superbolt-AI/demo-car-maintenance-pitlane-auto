import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Page = 'quote' | 'pricing' | 'appointments';
type VehicleType = 'car' | 'suv' | 'ute' | 'luxury';
type Status = 'Pending' | 'Confirmed' | 'Cancelled';
type VehiclePrices = Record<VehicleType, number>;
type Service = {
  id: string;
  name: string;
  description: string;
  minutes: number;
  cents: number;
  vehiclePrices: VehiclePrices;
};
type Quote = {
  id: string;
  make: string;
  model: string;
  year: number;
  vehicleType?: VehicleType;
  service: string;
  cents: number;
  minutes: number;
};
type Appointment = Quote & {
  name: string;
  email: string;
  date: string;
  time: string;
  status: Status;
  isDemo?: boolean;
};

const VEHICLES: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Car / Hatchback' },
  { value: 'suv', label: 'SUV' },
  { value: 'ute', label: 'Ute / Van' },
  { value: 'luxury', label: 'Luxury' },
];
const TIMES = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const STATUSES: Status[] = ['Pending', 'Confirmed', 'Cancelled'];
const money = (cents: number) => new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD',
}).format(cents / 100);
const today = () => new Date().toLocaleDateString('en-CA', {
  timeZone: 'Australia/Melbourne',
});

// All calculations and storage happen on the server.
async function api(path: string, data?: unknown) {
  const response = await fetch(path, data === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}
const post = (data: unknown) => api('/api/workshop', data);

function readPrices(form: FormData): VehiclePrices {
  return {
    car: Math.round(Number(form.get('car')) * 100),
    suv: Math.round(Number(form.get('suv')) * 100),
    ute: Math.round(Number(form.get('ute')) * 100),
    luxury: Math.round(Number(form.get('luxury')) * 100),
  };
}

function PriceFields({ values }: { values?: VehiclePrices }) {
  return <div className="price-fields">
    {VEHICLES.map(vehicle => <label key={vehicle.value}>
      {vehicle.label} (AUD)
      <Input name={vehicle.value} type="number" min="0" max="100000"
        step="0.01" required placeholder="0.00"
        defaultValue={values ? (values[vehicle.value] / 100).toFixed(2) : undefined} />
    </label>)}
  </div>;
}

export default function Workshop({ page }: { page: Page }) {
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedService, setSelectedService] = useState('essential');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booked, setBooked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api(`/api/workshop?view=${page}`);
      setServices(result.prices);
      setAppointments(result.appointments);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [page]);

  // Shared save/error handling keeps each action easy to read.
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clearQuote() {
    setQuote(null);
    setBookingOpen(false);
    setBooked(false);
  }

  async function generateQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const result = await post({
        action: 'quote',
        make: form.get('make'),
        model: form.get('model'),
        year: Number(form.get('year')),
        vehicleType: form.get('vehicleType'),
        service: selectedService,
      });
      setQuote(result);
      setBookingOpen(false);
      setBooked(false);
    });
  }

  async function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await post({
        action: 'book', quote: quote?.id,
        name: form.get('name'), email: form.get('email'),
        date: form.get('date'), time: form.get('time'),
      });
      setBooked(true);
      setBookingOpen(false);
    });
  }

  async function savePrices(event: FormEvent<HTMLFormElement>, service: Service) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const result = await post({
        action: 'price', id: service.id, vehiclePrices: readPrices(form),
      });
      setServices(current => current.map(item =>
        item.id === service.id ? result.service : item
      ));
      setNotice(`${service.name} prices saved.`);
    });
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await perform(async () => {
      const result = await post({
        action: 'addService', name: form.get('name'),
        description: form.get('description'), minutes: Number(form.get('minutes')),
        vehiclePrices: readPrices(form),
      });
      setServices(current => [...current, result.service]);
      element.reset();
      setNotice(`${result.service.name} added.`);
    });
  }

  async function updateStatus(id: string, status: Status) {
    await perform(async () => {
      await post({ action: 'status', id, status });
      setAppointments(current => current.map(item =>
        item.id === id ? { ...item, status } : item
      ));
      setNotice(`Appointment marked ${status.toLowerCase()}.`);
    });
  }

  async function resetDemoData() {
    const confirmed = window.confirm(
      'Reset all demo data? This restores default prices, removes custom services, quotes and customer appointments, and restores the three sample appointments.'
    );
    if (!confirmed) return;

    await perform(async () => {
      await post({ action: 'reset' });
      setSelectedService('essential');
      clearQuote();
      await load();
      setNotice('Demo data reset to defaults.');
    });
  }

  const titles = {
    quote: 'Your next service, made simple.',
    pricing: 'Services & vehicle pricing',
    appointments: 'Workshop appointments',
  };

  return <div>
    <header className="site-header">
      <a className="brand" href="/">PITLANE <span>AUTO</span></a>
      <nav aria-label="Main navigation">
        {[
          { page: 'quote', href: '/', label: 'Get a quote' },
          { page: 'pricing', href: '/pricing', label: 'Service pricing' },
          { page: 'appointments', href: '/appointments', label: 'Appointments' },
        ].map(link => <a key={link.page} href={link.href}
          aria-current={page === link.page ? 'page' : undefined}>
          {link.label}
        </a>)}
      </nav>
      <span className="demo-badge">WORKSHOP DEMO</span>
    </header>

    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSHOP, CONNECTED</p>
          <h1>{titles[page]}</h1>
          <p className="muted">{page === 'quote'
            ? 'Choose your vehicle and service to get an estimate.'
            : page === 'pricing'
              ? 'Set separate prices for each vehicle category. All amounts include GST.'
              : 'Review requests and update their status. Times are in Melbourne time.'}</p>
        </div>
        <Button className="reset-button" variant="outline" type="button"
          onClick={resetDemoData} disabled={busy || loading}>
          {busy ? 'Working…' : 'Reset demo data'}
        </Button>
      </div>

      {error && <div className="message error" role="alert">
        <span>{error}</span>
        <Button variant="outline" onClick={load} disabled={loading || busy}>Reload data</Button>
      </div>}
      {notice && <div className="message success" role="status">{notice}</div>}

      {page === 'quote' && <div className="quote-layout">
        <section className="panel">
          <h2>Build your quote</h2>
          <form onSubmit={generateQuote} onChange={clearQuote}>
            <fieldset disabled={busy || loading}>
              <legend>Your vehicle</legend>
              <div className="field-grid">
                <label>Make<Input name="make" placeholder="e.g. Toyota" maxLength={60} required /></label>
                <label>Model<Input name="model" placeholder="e.g. Corolla" maxLength={80} required /></label>
                <label>Year<Input name="year" type="number" min="1980"
                  max={new Date().getFullYear() + 1} placeholder="2020" required /></label>
                <label>Vehicle type<NativeSelect name="vehicleType" defaultValue="" required>
                  <option value="" disabled>Select vehicle type</option>
                  {VEHICLES.map(vehicle => <option key={vehicle.value} value={vehicle.value}>
                    {vehicle.label}
                  </option>)}
                </NativeSelect></label>
              </div>
              <h3>Choose a service</h3>
              {loading ? <p>Loading services…</p> : <div className="service-grid">
                {services.map(service => <label key={service.id}
                  className={`service-option ${selectedService === service.id ? 'selected' : ''}`}>
                  <input type="radio" name="service" value={service.id}
                    checked={selectedService === service.id}
                    onChange={() => setSelectedService(service.id)} />
                  <strong>{service.name}</strong>
                  <span className="muted">{service.description}</span>
                  <small>Approx. {service.minutes} minutes</small>
                </label>)}
              </div>}
              <Button className="wide" type="submit" disabled={!services.length}>
                {busy ? 'Calculating…' : 'Get my quote'}
              </Button>
            </fieldset>
          </form>
        </section>

        <aside>
          <section className="estimate">
            <p className="eyebrow">YOUR ESTIMATE</p>
            {quote ? <>
              <h2>{quote.year} {quote.make} {quote.model}</h2>
              <p>{VEHICLES.find(item => item.value === quote.vehicleType)?.label}</p>
              <div className="total">{money(quote.cents)}</div>
              <p>Including GST</p>
              <div className="estimate-detail"><span>{quote.service}</span><strong>{money(quote.cents)}</strong></div>
              <div className="estimate-detail"><span>Approx. duration</span><span>{quote.minutes} min</span></div>
              <p className="estimate-note">Based on the selected vehicle category. Final pricing is confirmed after inspection; additional work may cost extra.</p>
              {booked ? <div role="status">
                <strong>Appointment request received.</strong>
                <p>Status: Pending</p>
                <a href="/appointments">View appointments →</a>
              </div> : <Button className="wide" disabled={busy}
                onClick={() => setBookingOpen(current => !current)}>
                {bookingOpen ? 'Close booking form' : 'Request an appointment'}
              </Button>}
            </> : <>
              <h2>Clear pricing for your car.</h2>
              <p>Select a service and enter your vehicle details. Your estimate will appear here.</p>
              <p>No payment required.</p>
            </>}
          </section>

          {bookingOpen && quote && <section className="panel booking-panel">
            <h2>Request an appointment</h2>
            <p className="muted">Your preferred time is subject to confirmation.</p>
            <form onSubmit={requestAppointment}>
              <fieldset disabled={busy}>
                <label>Name<Input name="name" required maxLength={100} autoComplete="name" /></label>
                <label>Email<Input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
                <div className="field-grid">
                  <label>Date<Input name="date" type="date" min={today()} required /></label>
                  <label>Time<NativeSelect name="time">{TIMES.map(time =>
                    <option key={time}>{time}</option>
                  )}</NativeSelect></label>
                </div>
                <Button className="wide" type="submit">{busy ? 'Saving…' : 'Send request'}</Button>
              </fieldset>
            </form>
          </section>}
        </aside>
      </div>}

      {page === 'pricing' && <>
        {loading ? <p>Loading services…</p> : <div className="pricing-grid">
          {services.map(service => <section className="panel" key={service.id}>
            <h2>{service.name}</h2>
            <p className="muted">{service.description}</p>
            <p className="muted">Approx. {service.minutes} minutes</p>
            <form onSubmit={event => savePrices(event, service)}>
              <fieldset disabled={busy}>
                <PriceFields values={service.vehiclePrices} />
                <Button className="wide" variant="outline" type="submit">Save prices</Button>
              </fieldset>
            </form>
          </section>)}
        </div>}
        <section className="panel add-service">
          <h2>Add a service</h2>
          <p className="muted">Saved services appear on the customer quote page.</p>
          <form onSubmit={addService}>
            <fieldset disabled={busy || loading}>
              <div className="field-grid">
                <label>Service name<Input name="name" placeholder="e.g. Air conditioning service" maxLength={80} required /></label>
                <label>Duration (minutes)<Input name="minutes" type="number" min="5" max="1440" step="1" placeholder="60" required /></label>
              </div>
              <label>Description<Input name="description" placeholder="What is included?" maxLength={250} required /></label>
              <PriceFields />
              <Button className="wide" type="submit">{busy ? 'Saving…' : 'Add service'}</Button>
            </fieldset>
          </form>
        </section>
        <p className="muted">Price changes apply to new quotes. Earlier quotes and appointments retain their original estimate.</p>
      </>}

      {page === 'appointments' && <>
        <div className="stats">{STATUSES.map(status => <div className="panel" key={status}>
          <span>{status}</span>
          <strong>{loading ? '—' : appointments.filter(item => item.status === status).length}</strong>
        </div>)}</div>
        <section className="panel">
          <div className="section-heading"><h2>Appointments</h2>
            <Button variant="outline" onClick={load} disabled={loading || busy}>Refresh</Button>
          </div>
          {loading ? <p>Loading appointments…</p> : appointments.length === 0 ? <p>No appointments yet.</p> :
            <Table>
              <TableHeader><TableRow>{['Customer', 'Vehicle & service', 'Date & time', 'Estimate', 'Status'].map(title =>
                <TableHead key={title}>{title}</TableHead>
              )}</TableRow></TableHeader>
              <TableBody>{appointments.map(appointment => <TableRow key={appointment.id}>
                <TableCell><strong>{appointment.name}</strong>
                  {appointment.isDemo && <span className="sample-tag">Demo</span>}
                  <p className="muted">{appointment.email}</p>
                </TableCell>
                <TableCell><strong>{appointment.year} {appointment.make} {appointment.model}</strong>
                  <p className="muted">{appointment.service}</p>
                </TableCell>
                <TableCell>{new Date(appointment.date + 'T12:00:00').toLocaleDateString('en-AU')}
                  <p className="muted">{appointment.time} · Melbourne</p>
                </TableCell>
                <TableCell>{money(appointment.cents)}</TableCell>
                <TableCell><NativeSelect value={appointment.status} disabled={busy}
                  aria-label={`Status for ${appointment.name}`}
                  className={`status status-${appointment.status.toLowerCase()}`}
                  onChange={event => updateStatus(appointment.id, event.target.value as Status)}>
                  {STATUSES.map(status => <option key={status}>{status}</option>)}
                </NativeSelect></TableCell>
              </TableRow>)}</TableBody>
            </Table>}
        </section>
      </>}
      <footer>Shared demo · Use sample contact details · AUD prices include GST</footer>
    </main>
  </div>;
}
