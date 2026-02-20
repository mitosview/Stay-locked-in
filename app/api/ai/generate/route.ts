import { NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

const ModeSchema = z.enum(['summary', 'adjustments', 'response_draft']);

const RequestSchema = z.object({
  checkinId: z.string().uuid(),
  mode: ModeSchema
});

const SummarySchema = z.object({
  week_overview: z.object({
    trend: z.enum(['losing', 'gaining', 'stable', 'unclear']),
    weight_change_lbs: z.number(),
    rate_lbs_per_week: z.number(),
    adherence_assessment: z.enum(['high', 'medium', 'low', 'unclear']),
    key_observations: z.array(z.string()).min(1).max(6)
  }),
  risk_flags: z.array(
    z.object({
      type: z.enum([
        'plateau',
        'too_fast_loss',
        'too_fast_gain',
        'recovery_risk',
        'underreporting_suspected',
        'stress_sleep_issue',
        'digestion_issue',
        'injury_risk',
        'none'
      ]),
      severity: z.enum(['low', 'medium', 'high']),
      evidence: z.array(z.string()).min(1).max(5),
      note: z.string()
    })
  ),
  questions_for_next_checkin: z.array(z.string()).min(1).max(6)
});

const AdjustmentsSchema = z.object({
  recommendation: z.object({
    action: z.enum(['hold', 'adjust']),
    rationale: z.array(z.string()).min(1).max(6)
  }),
  next_week_plan: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    steps_target: z.number(),
    cardio_minutes_per_week: z.number()
  }),
  adjustments: z.array(
    z.object({
      type: z.enum(['macros', 'steps', 'cardio', 'refeed', 'deload', 'compliance_focus']),
      change: z.string(),
      reason: z.string()
    })
  ),
  safety_notes: z.array(z.string())
});

const ResponseDraftSchema = z.object({
  subject: z.string().min(1).max(120),
  message: z.string().min(1).max(2500),
  coach_edit_notes: z.array(z.string()).min(0).max(6)
});

function schemaForMode(mode: z.infer<typeof ModeSchema>) {
  switch (mode) {
    case 'summary':
      return SummarySchema;
    case 'adjustments':
      return AdjustmentsSchema;
    case 'response_draft':
      return ResponseDraftSchema;
  }
}

const SYSTEM_PROMPT = `
You are an elite bodybuilding prep coach and data analyst. Your job is to help a coach respond to an athlete’s weekly check-in with clear, conservative, evidence-based recommendations.

Rules:
- Be specific, concise, and actionable. No hype, no clichés.
- Never claim medical diagnosis. If something could be medical, flag it gently and recommend professional evaluation.
- Prioritize muscle retention during cuts: avoid aggressive changes unless adherence is high and trends justify it.
- Use trend logic: emphasize 7–14 day averages and context (sleep, training performance, adherence).
- If data is missing, call it out and propose what to track next week.
- Output MUST be valid JSON that matches the required schema. No markdown. No extra keys.
- If unsure, choose the safest conservative recommendation (e.g., hold macros, small changes).
`.trim();

function buildUserPrompt(mode: z.infer<typeof ModeSchema>, ctx: Record<string, unknown>) {
  if (mode === 'summary') {
    return `
Generate a weekly check-in summary for the coach.

Athlete context:
- Phase: ${ctx.phase}
- Goal: ${ctx.goal_description ?? 'N/A'}
- Current plan (last week):
  - Calories: ${(ctx.plan as Record<string, unknown> | null)?.calories ?? 'N/A'}
  - Protein_g: ${(ctx.plan as Record<string, unknown> | null)?.protein_g ?? 'N/A'}
  - Carbs_g: ${(ctx.plan as Record<string, unknown> | null)?.carbs_g ?? 'N/A'}
  - Fat_g: ${(ctx.plan as Record<string, unknown> | null)?.fat_g ?? 'N/A'}
  - Steps_target: ${(ctx.plan as Record<string, unknown> | null)?.steps_target ?? 'N/A'}
  - Cardio_minutes_per_week: ${(ctx.plan as Record<string, unknown> | null)?.cardio_minutes_per_week ?? 'N/A'}

Check-in data (this week):
- Week start date: ${(ctx.checkin as Record<string, unknown>).week_start_date}
- Weekly average weight: ${(ctx.checkin as Record<string, unknown>).weekly_avg_weight ?? 'N/A'}
- Last week average weight: ${ctx.last_week_avg_weight ?? 'N/A'}
- Training performance notes: ${(ctx.checkin as Record<string, unknown>).training_performance_notes ?? 'N/A'}
- Energy (1-10): ${(ctx.checkin as Record<string, unknown>).energy ?? 'N/A'}
- Hunger (1-10): ${(ctx.checkin as Record<string, unknown>).hunger ?? 'N/A'}
- Sleep: ${(ctx.checkin as Record<string, unknown>).sleep ?? 'N/A'}
- Stress: ${(ctx.checkin as Record<string, unknown>).stress ?? 'N/A'}
- Digestion notes: ${(ctx.checkin as Record<string, unknown>).digestion_notes ?? 'N/A'}
- Adherence estimate (%): ${(ctx.checkin as Record<string, unknown>).adherence_percent ?? 'N/A'}
- Notes: ${(ctx.checkin as Record<string, unknown>).notes ?? 'N/A'}

Return JSON in the exact schema you were instructed to follow.
`.trim();
  }

  if (mode === 'adjustments') {
    return `
Based on the athlete context + this week’s check-in, propose next-week plan adjustments.

Constraints:
- Prefer minimal effective change.
- If adherence is <80% OR data is unclear, default to "hold plan" and focus on compliance.
- If cutting: target loss rate typically ~0.5–1.0% bodyweight/week unless coach indicates otherwise.
- If bulking: aim for slow gain ~0.25–0.5% bodyweight/week.
- If performance dropping + sleep/stress poor, prioritize recovery over more deficit.

Athlete context:
- Phase: ${ctx.phase}
- Current plan:
  - Calories: ${(ctx.plan as Record<string, unknown> | null)?.calories ?? 'N/A'}
  - Protein_g: ${(ctx.plan as Record<string, unknown> | null)?.protein_g ?? 'N/A'}
  - Carbs_g: ${(ctx.plan as Record<string, unknown> | null)?.carbs_g ?? 'N/A'}
  - Fat_g: ${(ctx.plan as Record<string, unknown> | null)?.fat_g ?? 'N/A'}
  - Steps_target: ${(ctx.plan as Record<string, unknown> | null)?.steps_target ?? 'N/A'}
  - Cardio_minutes_per_week: ${(ctx.plan as Record<string, unknown> | null)?.cardio_minutes_per_week ?? 'N/A'}
- Weekly average weight: ${(ctx.checkin as Record<string, unknown>).weekly_avg_weight ?? 'N/A'}
- Last week average weight: ${ctx.last_week_avg_weight ?? 'N/A'}
- Adherence estimate (%): ${(ctx.checkin as Record<string, unknown>).adherence_percent ?? 'N/A'}
- Training performance: ${(ctx.checkin as Record<string, unknown>).training_performance_notes ?? 'N/A'}
- Energy: ${(ctx.checkin as Record<string, unknown>).energy ?? 'N/A'} / Hunger: ${(ctx.checkin as Record<string, unknown>).hunger ?? 'N/A'} / Sleep: ${(ctx.checkin as Record<string, unknown>).sleep ?? 'N/A'} / Stress: ${(ctx.checkin as Record<string, unknown>).stress ?? 'N/A'}

Return JSON in the exact schema you were instructed to follow.
`.trim();
  }

  return `
Write a weekly check-in response message from the coach to the athlete.
Tone: direct, supportive, authoritative. No fluff.

Inputs:
- Athlete name: ${ctx.athlete_name ?? 'Athlete'}
- Phase: ${ctx.phase}
- Summary bullets: ${JSON.stringify(ctx.summary_bullets ?? [])}
- Risk flags: ${JSON.stringify(ctx.risk_flags ?? [])}
- Next-week plan: calories ${(ctx.next_plan as Record<string, unknown> | null)?.calories ?? 'N/A'}, P ${(ctx.next_plan as Record<string, unknown> | null)?.protein_g ?? 'N/A'}, C ${(ctx.next_plan as Record<string, unknown> | null)?.carbs_g ?? 'N/A'}, F ${(ctx.next_plan as Record<string, unknown> | null)?.fat_g ?? 'N/A'}, steps ${(ctx.next_plan as Record<string, unknown> | null)?.steps_target ?? 'N/A'}, cardio ${(ctx.next_plan as Record<string, unknown> | null)?.cardio_minutes_per_week ?? 'N/A'}
- Compliance/adherence: ${(ctx.checkin as Record<string, unknown>).adherence_percent ?? 'N/A'}%
- Athlete notes: ${(ctx.checkin as Record<string, unknown>).notes ?? 'N/A'}

Requirements:
- Start with 1–2 sentences acknowledging the week outcome.
- Include 3–5 bullet points: what went well, what to fix, what to watch.
- State the plan changes clearly (or say “no changes”).
- Give 1–2 specific execution instructions.
- End with 1 short question to gather missing info.
- Keep under 1800 characters.

Return JSON in the exact schema you were instructed to follow.
`.trim();
}

function tryParseJson(text: string): unknown {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No JSON object found in response.');
  }
  const jsonStr = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonStr);
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing server environment variables.' }, { status: 500 });
    }

    const body = await req.json();
    const { checkinId, mode } = RequestSchema.parse(body);

    const { data: checkin, error: checkinErr } = await supabaseAdmin
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .single();

    if (checkinErr || !checkin) {
      return NextResponse.json({ error: 'Check-in not found.' }, { status: 404 });
    }

    const athleteId = checkin.athlete_id as string;

    const { data: athlete, error: athleteErr } = await supabaseAdmin
      .from('athletes')
      .select('id, user_id, phase, goal_description, display_name')
      .eq('id', athleteId)
      .single();

    if (athleteErr || !athlete) {
      return NextResponse.json({ error: 'Athlete not found.' }, { status: 404 });
    }

    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: prior } = await supabaseAdmin
      .from('checkins')
      .select('weekly_avg_weight, week_start_date')
      .eq('athlete_id', athleteId)
      .lt('week_start_date', checkin.week_start_date as string)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: priorAi } = await supabaseAdmin
      .from('ai_outputs')
      .select('output_type, content')
      .eq('checkin_id', checkinId);

    const summaryOut = priorAi?.find((x) => x.output_type === 'summary')?.content as
      | Record<string, unknown>
      | undefined;
    const adjOut = priorAi?.find((x) => x.output_type === 'macro_suggestion')?.content as
      | Record<string, unknown>
      | undefined;

    const ctx = {
      phase: athlete.phase ?? 'cut',
      goal_description: athlete.goal_description,
      athlete_name: athlete.display_name,
      plan,
      checkin,
      last_week_avg_weight: prior?.weekly_avg_weight ?? null,
      summary_bullets: (summaryOut?.week_overview as Record<string, unknown> | undefined)
        ?.key_observations ?? [],
      risk_flags: summaryOut?.risk_flags ?? [],
      next_plan: (adjOut?.next_week_plan as Record<string, unknown> | undefined) ?? null
    };

    const schema = schemaForMode(mode);
    const userPrompt = buildUserPrompt(mode, ctx);

    const maxAttempts = 3;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ]
        });

        const text = completion.choices[0]?.message?.content ?? '';
        const parsed = tryParseJson(text);
        const validated = schema.parse(parsed);

        const outputType =
          mode === 'summary' ? 'summary' : mode === 'adjustments' ? 'macro_suggestion' : 'response_draft';

        const { error: insertErr } = await supabaseAdmin.from('ai_outputs').insert({
          checkin_id: checkinId,
          output_type: outputType,
          content: validated,
          model_version: 'gpt-4.1-mini'
        });

        if (insertErr) {
          return NextResponse.json({ error: 'Failed to store ai output.' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, output_type: outputType, content: validated });
      } catch (err) {
        lastErr = err;
      }
    }

    return NextResponse.json(
      {
        error: 'AI output validation failed.',
        details: lastErr instanceof Error ? lastErr.message : String(lastErr)
      },
      { status: 422 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: 'Bad request.',
        details: e instanceof Error ? e.message : String(e)
      },
      { status: 400 }
    );
  }
}
