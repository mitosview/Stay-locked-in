import { NextRequest, NextResponse } from 'next/server';
import { openai, AI_MODEL } from '@/lib/openai';
import { supabaseInsert } from '@/lib/supabase';

type Body = {
  checkinId: string;
  context: {
    athlete_name?: string;
    phase?: string;
    key_observations_array?: string[];
    risk_flags_array?: string[];
    new_calories?: number;
    new_protein?: number;
    new_carbs?: number;
    new_fat?: number;
    new_steps?: number;
    new_cardio?: number;
    adherence_percent?: number;
    athlete_notes?: string;
    [key: string]: unknown;
  };
};

type CoachMessage = {
  subject: string;
  message: string;
  coach_edit_notes: [string, string];
};

function isValidCoachMessage(value: unknown): value is CoachMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.subject === 'string' &&
    typeof v.message === 'string' &&
    Array.isArray(v.coach_edit_notes) &&
    v.coach_edit_notes.length === 2 &&
    v.coach_edit_notes.every((item) => typeof item === 'string')
  );
}

async function requestMessage(context: Body['context'], retryHint?: string) {
  const systemPrompt = [
    'Write a weekly check-in response message from the coach to the athlete.',
    'Tone: direct, supportive, authoritative. No fluff.',
    'Requirements:',
    '- Start with 1-2 sentences acknowledging the week outcome.',
    '- Include 3-5 bullet points covering what went well, what to fix, and what to watch.',
    '- State plan changes clearly, or explicitly say no changes.',
    '- Give 1-2 specific execution instructions.',
    '- End with one short question to gather missing info.',
    '- Keep message under 1800 characters.',
    '- Output valid JSON only with exactly keys: subject, message, coach_edit_notes.',
    '- coach_edit_notes must contain exactly 2 strings the coach should quickly verify before sending.'
  ].join('\n');

  return openai.chat.completions.create({
    model: AI_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'coach_weekly_message',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { type: 'string' },
            message: { type: 'string', maxLength: 1800 },
            coach_edit_notes: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2
            }
          },
          required: ['subject', 'message', 'coach_edit_notes']
        }
      }
    },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Inputs JSON:
${JSON.stringify(context, null, 2)}` + (retryHint ? `\n\nRetry note: ${retryHint}` : '')
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

    let parsed: CoachMessage | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await requestMessage(
        body.context,
        attempt === 1 ? 'Previous response failed schema validation. Return schema-compliant JSON only.' : undefined
      );
      const raw = completion.choices[0]?.message?.content ?? '{}';
      try {
        const candidate = JSON.parse(raw) as unknown;
        if (isValidCoachMessage(candidate)) {
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
        output_type: 'response_draft',
        content: parsed,
        model_version: AI_MODEL
      },
      { useServiceRole: true }
    );

    return NextResponse.json({ data: parsed, model: AI_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate coach message', details: String(error) },
      { status: 500 }
    );
  }
}
