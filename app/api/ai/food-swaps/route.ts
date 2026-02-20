import { NextRequest, NextResponse } from 'next/server';
import { openai, AI_MODEL } from '@/lib/openai';
import { supabaseInsert } from '@/lib/supabase';

type Body = {
  checkinId: string;
  context: {
    p?: number;
    c?: number;
    f?: number;
    swap_request?: string;
    constraints_optional?: string;
    [key: string]: unknown;
  };
};

type SwapResponse = {
  swap_options: Array<{
    option_name: string;
    ingredients: string[];
    approx_macros: {
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    };
    prep_notes: string;
  }>;
  disclaimer: string;
};

function num(v: unknown, d = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function fallbackSwap(context: Body['context']): SwapResponse {
  const p = num(context.p, 0);
  const c = num(context.c, 0);
  const f = num(context.f, 0);
  return {
    swap_options: [
      {
        option_name: 'Lean protein + easy carb + measured fat',
        ingredients: ['Cooked chicken breast', 'Cooked white rice', 'Olive oil'],
        approx_macros: {
          protein_g: p,
          carbs_g: c,
          fat_g: f
        },
        prep_notes:
          'Adjust cooked portions by weight to match your target macros closely. Keep seasoning and sodium consistent meal-to-meal.'
      }
    ],
    disclaimer:
      'Macro values are estimates and vary by brand, cooking method, and food weight. Confirm with your tracker and labels.'
  };
}

function isValidSwapResponse(value: unknown): value is SwapResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.disclaimer === 'string' && Array.isArray(v.swap_options);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.checkinId || !body?.context) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const systemPrompt = [
      'You are a bodybuilding nutrition assistant. Propose macro-equivalent food swaps.',
      'Use the provided meal macro targets and requested swap details.',
      'Respect stated constraints (e.g., low FODMAP, dairy-free).',
      'Keep options practical and concise.',
      'Output valid JSON only with exactly keys: swap_options, disclaimer.'
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'food_swap_options',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              swap_options: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    option_name: { type: 'string' },
                    ingredients: { type: 'array', items: { type: 'string' }, minItems: 1 },
                    approx_macros: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        protein_g: { type: 'number' },
                        carbs_g: { type: 'number' },
                        fat_g: { type: 'number' }
                      },
                      required: ['protein_g', 'carbs_g', 'fat_g']
                    },
                    prep_notes: { type: 'string' }
                  },
                  required: ['option_name', 'ingredients', 'approx_macros', 'prep_notes']
                }
              },
              disclaimer: { type: 'string' }
            },
            required: ['swap_options', 'disclaimer']
          }
        }
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Inputs JSON:\n${JSON.stringify(body.context, null, 2)}` }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: SwapResponse;

    try {
      const candidate = JSON.parse(raw) as unknown;
      parsed = isValidSwapResponse(candidate) ? candidate : fallbackSwap(body.context);
    } catch {
      parsed = fallbackSwap(body.context);
    }

    await supabaseInsert(
      'ai_outputs',
      {
        checkin_id: body.checkinId,
        output_type: 'food_swaps',
        content: parsed,
        model_version: AI_MODEL
      },
      { useServiceRole: true }
    );

    return NextResponse.json({ data: parsed, model: AI_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate food swaps', details: String(error) },
      { status: 500 }
    );
  }
}
