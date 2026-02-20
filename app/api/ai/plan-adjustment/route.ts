import { NextRequest, NextResponse } from 'next/server';
import { openai, AI_MODEL } from '@/lib/openai';
import { supabaseInsert } from '@/lib/supabase';

type Body = {
  checkinId: string;
  context: {
    phase?: 'cut' | 'bulk' | 'maintenance' | 'prep' | string;
    coach_override?: boolean;
    current_plan?: {
      calories?: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
      steps_target?: number;
      cardio_minutes_per_week?: number;
    };
    weekly_avg_weight?: number;
    adherence_percent?: number;
    training_performance_notes?: string;
    energy?: number | string;
    hunger?: number | string;
    sleep?: number | string;
    stress?: number | string;
    [key: string]: unknown;
  };
};

type PlanAdjustment = {
  recommendation: {
    action: 'hold' | 'adjust';
    rationale: [string, string, string];
  };
  next_week_plan: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    steps_target: number;
    cardio_minutes_per_week: number;
  };
  adjustments: Array<{
    type: 'macros' | 'steps' | 'cardio' | 'refeed' | 'deload' | 'compliance_focus';
    change: string;
    reason: string;
  }>;
  safety_notes: string[];
};

function getNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function holdPlan(context: Body['context'], reason: string): PlanAdjustment {
  const current = context.current_plan ?? {};
  return {
    recommendation: {
      action: 'hold',
      rationale: [
        reason,
        'Minimal effective change principle favors preserving current targets until compliance and recovery are clear.',
        'Conservative progression helps protect muscle retention and reduce decision noise.'
      ]
    },
    next_week_plan: {
      calories: getNumber(current.calories, 0),
      protein_g: getNumber(current.protein_g, 0),
      carbs_g: getNumber(current.carbs_g, 0),
      fat_g: getNumber(current.fat_g, 0),
      steps_target: getNumber(current.steps_target, 0),
      cardio_minutes_per_week: getNumber(current.cardio_minutes_per_week, 0)
    },
    adjustments: [
      {
        type: 'compliance_focus',
        change: 'Hold all targets and improve meal, steps, cardio, and logging consistency for 7 days.',
        reason
      }
    ],
    safety_notes: [
      'No medical diagnosis is being made.',
      'If persistent fatigue, dizziness, GI distress, or other concerning symptoms occur, seek qualified medical evaluation.'
    ]
  };
}

function isValidPlanAdjustment(value: unknown): value is PlanAdjustment {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Boolean(v.recommendation && v.next_week_plan && Array.isArray(v.adjustments) && Array.isArray(v.safety_notes));
}

function enforceGuardrails(parsed: PlanAdjustment, context: Body['context']): PlanAdjustment {
  const adherence = getNumber(context.adherence_percent, 0);
  const coachOverride = Boolean(context.coach_override);
  const currentCarbs = getNumber(context.current_plan?.carbs_g, parsed.next_week_plan.carbs_g);

  if (adherence < 80 && !coachOverride) {
    return holdPlan(context, 'Adherence is below 80%, so hold the plan and prioritize compliance before making adjustments.');
  }

  if (!coachOverride) {
    const carbDelta = parsed.next_week_plan.carbs_g - currentCarbs;
    if (Math.abs(carbDelta) > 50) {
      parsed.next_week_plan.carbs_g = currentCarbs + Math.sign(carbDelta) * 50;
      parsed.adjustments = [
        ...parsed.adjustments,
        {
          type: 'macros',
          change: `Carbs capped to ${parsed.next_week_plan.carbs_g}g (max ±50g weekly change guardrail).`,
          reason: 'Guardrail applied automatically to avoid aggressive weekly macro swings.'
        }
      ];
    }
  }

  return parsed;
}

async function requestPlan(context: Body['context'], retryHint?: string) {
  const systemPrompt = [
    'You are an elite bodybuilding prep coach and data analyst.',
    'Based on athlete context and this week check-in, propose next-week plan adjustments with conservative evidence-based logic.',
    'Constraints:',
    '- Prefer minimal effective change.',
    '- If adherence is <80% OR data is unclear, default to action="hold" and focus on compliance.',
    '- If cutting: target loss rate typically around 0.5-1.0% bodyweight/week unless otherwise specified.',
    '- If bulking: aim for slow gain around 0.25-0.5% bodyweight/week.',
    '- If performance is dropping with poor sleep/stress, prioritize recovery over more deficit.',
    '- Be specific and concise. No hype/cliches.',
    '- Never claim medical diagnosis. Gently suggest professional evaluation if potentially medical concerns are implied.',
    '- Output valid JSON only that matches required schema exactly.'
  ].join('\n');

  return openai.chat.completions.create({
    model: AI_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'next_week_plan_adjustment',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            recommendation: {
              type: 'object',
              additionalProperties: false,
              properties: {
                action: { type: 'string', enum: ['hold', 'adjust'] },
                rationale: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
              },
              required: ['action', 'rationale']
            },
            next_week_plan: {
              type: 'object',
              additionalProperties: false,
              properties: {
                calories: { type: 'number' },
                protein_g: { type: 'number' },
                carbs_g: { type: 'number' },
                fat_g: { type: 'number' },
                steps_target: { type: 'number' },
                cardio_minutes_per_week: { type: 'number' }
              },
              required: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'steps_target', 'cardio_minutes_per_week']
            },
            adjustments: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { type: 'string', enum: ['macros', 'steps', 'cardio', 'refeed', 'deload', 'compliance_focus'] },
                  change: { type: 'string' },
                  reason: { type: 'string' }
                },
                required: ['type', 'change', 'reason']
              }
            },
            safety_notes: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1
            }
          },
          required: ['recommendation', 'next_week_plan', 'adjustments', 'safety_notes']
        }
      }
    },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Athlete context and check-in JSON:\n${JSON.stringify(context, null, 2)}` +
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

    let parsed: PlanAdjustment | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await requestPlan(
        body.context,
        attempt === 1 ? 'Previous response failed schema validation. Return schema-compliant JSON only.' : undefined
      );
      const raw = completion.choices[0]?.message?.content ?? '{}';
      try {
        const candidate = JSON.parse(raw) as unknown;
        if (isValidPlanAdjustment(candidate)) {
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

    parsed = enforceGuardrails(parsed, body.context);

    await supabaseInsert(
      'ai_outputs',
      {
        checkin_id: body.checkinId,
        output_type: 'macro_suggestion',
        content: parsed,
        model_version: AI_MODEL
      },
      { useServiceRole: true }
    );

    return NextResponse.json({ data: parsed, model: AI_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate plan adjustment', details: String(error) },
      { status: 500 }
    );
  }
}
