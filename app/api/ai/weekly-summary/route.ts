import { NextRequest, NextResponse } from 'next/server';
import { openai, AI_MODEL } from '@/lib/openai';
import { supabaseInsert } from '@/lib/supabase';

type Body = {
  checkinId: string;
  context: Record<string, unknown>;
};

type WeeklySummary = {
  week_overview: {
    trend: 'losing' | 'gaining' | 'stable' | 'unclear';
    weight_change_lbs: number;
    rate_lbs_per_week: number;
    adherence_assessment: 'high' | 'medium' | 'low' | 'unclear';
    key_observations: [string, string, string];
  };
  risk_flags: Array<{
    type:
      | 'plateau'
      | 'too_fast_loss'
      | 'too_fast_gain'
      | 'recovery_risk'
      | 'underreporting_suspected'
      | 'stress_sleep_issue'
      | 'digestion_issue'
      | 'injury_risk'
      | 'none';
    severity: 'low' | 'medium' | 'high';
    evidence: [string, string];
    note: string;
  }>;
  questions_for_next_checkin: [string, string, string];
};

function isWeeklySummary(value: unknown): value is WeeklySummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as any;
  return Boolean(v.week_overview && Array.isArray(v.risk_flags) && Array.isArray(v.questions_for_next_checkin));
}

async function requestSummary(context: Record<string, unknown>, retryHint?: string) {
  const systemPrompt = [
    'You are an elite bodybuilding prep coach and data analyst. Your job is to help a coach respond to an athlete weekly check-in with clear, conservative, evidence-based recommendations.',
    'Rules:',
    '- Be specific, concise, and actionable. No hype, no cliches.',
    '- Never claim medical diagnosis. If something could be medical, flag it gently and recommend professional evaluation.',
    '- Prioritize muscle retention during cuts: avoid aggressive changes unless adherence is high and trends justify it.',
    '- Use trend logic: emphasize 7-14 day averages and context (sleep, training performance, adherence).',
    '- If data is missing, call it out and propose what to track next week.',
    '- If unsure, choose the safest conservative recommendation.'
  ].join('\n');

  return openai.chat.completions.create({
    model: AI_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'weekly_checkin_summary',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            week_overview: {
              type: 'object',
              additionalProperties: false,
              properties: {
                trend: { type: 'string', enum: ['losing', 'gaining', 'stable', 'unclear'] },
                weight_change_lbs: { type: 'number' },
                rate_lbs_per_week: { type: 'number' },
                adherence_assessment: { type: 'string', enum: ['high', 'medium', 'low', 'unclear'] },
                key_observations: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
              },
              required: ['trend', 'weight_change_lbs', 'rate_lbs_per_week', 'adherence_assessment', 'key_observations']
            },
            risk_flags: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { type: 'string', enum: ['plateau', 'too_fast_loss', 'too_fast_gain', 'recovery_risk', 'underreporting_suspected', 'stress_sleep_issue', 'digestion_issue', 'injury_risk', 'none'] },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  evidence: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                  note: { type: 'string' }
                },
                required: ['type', 'severity', 'evidence', 'note']
              }
            },
            questions_for_next_checkin: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
          },
          required: ['week_overview', 'risk_flags', 'questions_for_next_checkin']
        }
      }
    },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          'Generate a weekly check-in summary for the coach. Return JSON in the exact schema requested.\n\nAthlete context and check-in data:\n' +
          JSON.stringify(context, null, 2) +
          (retryHint ? `\n\nRetry note: ${retryHint}` : '')
      }
    ]
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.checkinId || !body?.context) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    let parsed: WeeklySummary | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await requestSummary(
        body.context,
        attempt === 1 ? 'Previous response failed schema validation. Return schema-compliant JSON only.' : undefined
      );
      const raw = completion.choices[0]?.message?.content ?? '{}';
      try {
        const candidate = JSON.parse(raw) as unknown;
        if (isWeeklySummary(candidate)) {
          parsed = candidate;
          break;
        }
      } catch {
        // retry
      }
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Model returned invalid JSON schema twice' }, { status: 502 });
    }

    await supabaseInsert(
      'ai_outputs',
      {
        checkin_id: body.checkinId,
        output_type: 'summary',
        content: parsed,
        model_version: AI_MODEL
      },
      { useServiceRole: true }
    );

    return NextResponse.json({ data: parsed, model: AI_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate weekly summary', details: String(error) },
      { status: 500 }
    );
  }
}
