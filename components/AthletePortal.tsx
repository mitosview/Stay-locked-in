'use client';

import { FormEvent, useState } from 'react';
import { supabaseInsert, supabaseSelect } from '@/lib/supabase';

type Plan = { start_date: string; macros: any; cardio: string | null; steps: number | null; notes: string | null };
type Message = { id: string; message_text: string; sent_at: string };

export default function AthletePortal() {
  const [athleteId, setAthleteId] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [weight, setWeight] = useState('');
  const [energy, setEnergy] = useState('');
  const [hunger, setHunger] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  async function loadPortal() {
    try {
      const [planRows, messageRows] = await Promise.all([
        supabaseSelect<Plan[]>('plans', {
          select: '*',
          filters: { athlete_id: athleteId },
          order: 'start_date',
          ascending: false,
          limit: 1
        }),
        supabaseSelect<Message[]>('messages', {
          select: '*',
          filters: { athlete_id: athleteId },
          order: 'sent_at',
          ascending: false
        })
      ]);
      setPlan(planRows?.[0] ?? null);
      setMessages(messageRows ?? []);
    } catch (error) {
      alert(String(error));
    }
  }

  async function submitCheckin(e: FormEvent) {
    e.preventDefault();
    try {
      await supabaseInsert('checkins', {
        athlete_id: athleteId,
        week_start_date: weekStartDate,
        weight: weight ? Number(weight) : null,
        energy: energy ? Number(energy) : null,
        hunger: hunger ? Number(hunger) : null,
        notes
      });
    } catch (error) {
      return alert(String(error));
    }
    alert('Check-in submitted.');
    setWeight('');
    setEnergy('');
    setHunger('');
    setNotes('');
    await loadPortal();
  }

  return (
    <div className="grid grid-2">
      <section className="card">
        <h2>Athlete Portal</h2>
        <label>Athlete profile ID</label>
        <input value={athleteId} onChange={(e) => setAthleteId(e.target.value)} placeholder="athletes.id" />
        <button type="button" onClick={loadPortal} style={{ marginTop: '.75rem' }}>Load my portal</button>

        <form onSubmit={submitCheckin}>
          <h3>Submit Weekly Check-in</h3>
          <label>Week Start Date</label>
          <input type="date" required value={weekStartDate} onChange={(e) => setWeekStartDate(e.target.value)} />
          <label>Weight</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} />
          <label>Energy (1-10)</label>
          <input value={energy} onChange={(e) => setEnergy(e.target.value)} />
          <label>Hunger (1-10)</label>
          <input value={hunger} onChange={(e) => setHunger(e.target.value)} />
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          <button type="submit">Submit check-in</button>
        </form>
      </section>

      <section className="card">
        <h3>Current Plan</h3>
        {plan ? (
          <>
            <p>Start: {plan.start_date}</p>
            <pre>{JSON.stringify(plan.macros, null, 2)}</pre>
            <p>Cardio: {plan.cardio ?? 'n/a'}</p>
            <p>Steps: {plan.steps ?? 'n/a'}</p>
            <p>{plan.notes}</p>
          </>
        ) : <p>No plan found.</p>}

        <h3>Messages from Coach</h3>
        {messages.map((m) => (
          <div key={m.id} className="card">
            <small>{new Date(m.sent_at).toLocaleString()}</small>
            <p>{m.message_text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
