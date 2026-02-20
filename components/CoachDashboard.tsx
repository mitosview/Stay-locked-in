'use client';

import { FormEvent, useMemo, useState } from 'react';
import { supabaseInsert, supabaseSelect } from '@/lib/supabase';

type Athlete = { id: string; display_name: string | null };
type Checkin = {
  id: string;
  athlete_id: string;
  week_start_date: string;
  weight: number | null;
  energy: number | null;
  hunger: number | null;
  notes: string | null;
};

type SummaryOutput = {
  week_overview?: unknown;
  risk_flags?: unknown;
  questions_for_next_checkin?: unknown;
};

type AdjustmentOutput = {
  recommendation?: unknown;
  next_week_plan?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    steps_target?: number;
    cardio_minutes_per_week?: number;
  };
  adjustments?: unknown;
  safety_notes?: unknown;
};

export default function CoachDashboard() {
  const [coachId, setCoachId] = useState('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [selectedCheckinId, setSelectedCheckinId] = useState<string>('');
  const [summary, setSummary] = useState<SummaryOutput | null>(null);
  const [adjustment, setAdjustment] = useState<AdjustmentOutput | null>(null);
  const [draft, setDraft] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingAdjustment, setLoadingAdjustment] = useState(false);
  const [loadingResponse, setLoadingResponse] = useState(false);

  const selectedCheckin = useMemo(
    () => checkins.find((checkin) => checkin.id === selectedCheckinId) ?? null,
    [checkins, selectedCheckinId]
  );

  async function loadAthletes(e: FormEvent) {
    e.preventDefault();
    try {
      const data = await supabaseSelect<any[]>('coach_athlete_memberships', {
        select: 'athlete_id,athletes(id,display_name)',
        filters: { coach_id: coachId, status: 'active' }
      });
      const rows = (data ?? []).map((row: any) => row.athletes).filter(Boolean);
      setAthletes(rows);
      setSelectedAthlete('');
      setCheckins([]);
      resetOutputs();
    } catch (error) {
      alert(String(error));
    }
  }

  function resetOutputs() {
    setSelectedCheckinId('');
    setSummary(null);
    setAdjustment(null);
    setDraft('');
  }

  async function openAthlete(athleteId: string) {
    setSelectedAthlete(athleteId);
    resetOutputs();

    try {
      const data = await supabaseSelect<Checkin[]>('checkins', {
        select: '*',
        filters: { athlete_id: athleteId },
        order: 'week_start_date',
        ascending: false
      });
      setCheckins(data ?? []);
    } catch (error) {
      alert(String(error));
    }
  }

  async function loadSummaryForCheckin(checkin: Checkin) {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/ai/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: checkin.id,
          context: {
            athlete_name: athletes.find((a) => a.id === selectedAthlete)?.display_name,
            week_start_date: checkin.week_start_date,
            weekly_avg_weight: checkin.weight,
            energy: checkin.energy,
            hunger: checkin.hunger,
            athlete_notes: checkin.notes
          }
        })
      });
      const payload = await res.json();
      if (!res.ok) return alert(payload.error || 'Summary generation failed');
      setSummary(payload.data ?? null);
    } catch (error) {
      alert(String(error));
    } finally {
      setLoadingSummary(false);
    }
  }

  async function selectCheckin(checkinId: string) {
    setSelectedCheckinId(checkinId);
    setSummary(null);
    setAdjustment(null);
    setDraft('');
    const checkin = checkins.find((c) => c.id === checkinId);
    if (checkin) await loadSummaryForCheckin(checkin);
  }

  async function generateAdjustments() {
    if (!selectedCheckin) return;
    setLoadingAdjustment(true);
    try {
      const res = await fetch('/api/ai/plan-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: selectedCheckin.id,
          context: {
            phase: 'cut',
            adherence_percent: 85,
            current_plan: {
              calories: 2200,
              protein_g: 200,
              carbs_g: 220,
              fat_g: 60,
              steps_target: 9000,
              cardio_minutes_per_week: 120
            },
            training_performance_notes: selectedCheckin.notes,
            energy: selectedCheckin.energy,
            hunger: selectedCheckin.hunger,
            sleep: 'unknown',
            stress: 'unknown'
          }
        })
      });
      const payload = await res.json();
      if (!res.ok) return alert(payload.error || 'Adjustment generation failed');
      setAdjustment(payload.data ?? null);
    } catch (error) {
      alert(String(error));
    } finally {
      setLoadingAdjustment(false);
    }
  }

  async function generateResponseDraft() {
    if (!selectedCheckin) return;
    setLoadingResponse(true);
    try {
      const nextWeekPlan = adjustment?.next_week_plan ?? {};
      const res = await fetch('/api/ai/coach-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: selectedCheckin.id,
          context: {
            athlete_name: athletes.find((a) => a.id === selectedAthlete)?.display_name,
            phase: 'cut',
            key_observations_array: summary?.week_overview ? [JSON.stringify(summary.week_overview)] : [],
            risk_flags_array: summary?.risk_flags ? [JSON.stringify(summary.risk_flags)] : [],
            new_calories: nextWeekPlan.calories,
            new_protein: nextWeekPlan.protein_g,
            new_carbs: nextWeekPlan.carbs_g,
            new_fat: nextWeekPlan.fat_g,
            new_steps: nextWeekPlan.steps_target,
            new_cardio: nextWeekPlan.cardio_minutes_per_week,
            adherence_percent: 85,
            athlete_notes: selectedCheckin.notes
          }
        })
      });
      const payload = await res.json();
      if (!res.ok) return alert(payload.error || 'Response draft generation failed');
      setDraft(payload.data?.message ?? '');
    } catch (error) {
      alert(String(error));
    } finally {
      setLoadingResponse(false);
    }
  }

  async function sendMessage() {
    if (!draft || !selectedAthlete) return;
    try {
      await supabaseInsert('messages', {
        athlete_id: selectedAthlete,
        coach_id: coachId,
        message_text: draft,
        sent_at: new Date().toISOString()
      });
      alert('Message sent');
      setDraft('');
    } catch (error) {
      alert(String(error));
    }
  }

  return (
    <div className="grid grid-2">
      <section className="card">
        <h2>Coach Dashboard</h2>
        <form onSubmit={loadAthletes}>
          <label>Coach profile ID</label>
          <input value={coachId} onChange={(e) => setCoachId(e.target.value)} placeholder="coaches.id" required />
          <button type="submit" style={{ marginTop: '.75rem' }}>Load athletes</button>
        </form>

        <h3 style={{ marginTop: '1rem' }}>Athletes</h3>
        <ul>
          {athletes.map((athlete) => (
            <li key={athlete.id}>
              <button type="button" onClick={() => openAthlete(athlete.id)}>{athlete.display_name ?? athlete.id}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Athlete Check-ins</h3>
        {selectedAthlete ? <p>Selected athlete: {selectedAthlete}</p> : <p>Select an athlete.</p>}

        {checkins.length === 0 ? <p>No check-ins found.</p> : null}
        {checkins.map((checkin) => (
          <label key={checkin.id} className="card" style={{ cursor: 'pointer' }}>
            <input type="radio" name="selectedCheckin" checked={selectedCheckinId === checkin.id} onChange={() => selectCheckin(checkin.id)} />
            <strong style={{ marginLeft: '.5rem' }}>{checkin.week_start_date}</strong>
            <p>Weight: {checkin.weight ?? 'n/a'} | Energy: {checkin.energy ?? 'n/a'} | Hunger: {checkin.hunger ?? 'n/a'}</p>
            <p>{checkin.notes}</p>
          </label>
        ))}

        <button type="button" onClick={generateAdjustments} disabled={!selectedCheckin || loadingAdjustment}>
          {loadingAdjustment ? 'Generating...' : 'Generate Adjustments'}
        </button>
        <button type="button" onClick={generateResponseDraft} disabled={!selectedCheckin || loadingResponse} style={{ marginLeft: '.5rem' }}>
          {loadingResponse ? 'Generating...' : 'Generate Response'}
        </button>

        {loadingSummary ? <p>Generating summary…</p> : null}
        {summary ? (
          <div className="card" style={{ marginTop: '.75rem' }}>
            <h4>Summary</h4>
            <pre>{JSON.stringify(summary, null, 2)}</pre>
          </div>
        ) : null}

        {adjustment ? (
          <div className="card" style={{ marginTop: '.75rem' }}>
            <h4>Macro Suggestion</h4>
            <pre>{JSON.stringify(adjustment, null, 2)}</pre>
          </div>
        ) : null}

        <label>Approved message draft</label>
        <textarea rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" onClick={sendMessage} disabled={!draft.trim()}>Approve &amp; Send</button>
      </section>
    </div>
  );
}
