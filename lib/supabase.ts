const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type FilterValue = string | number | boolean;

function buildQuery(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return search.toString();
}

export async function supabaseSelect<T>(
  table: string,
  {
    select,
    filters = {},
    order,
    ascending = false,
    limit,
    single = false,
    useServiceRole = false
  }: {
    select: string;
    filters?: Record<string, FilterValue>;
    order?: string;
    ascending?: boolean;
    limit?: number;
    single?: boolean;
    useServiceRole?: boolean;
  }
): Promise<T> {
  const params: Record<string, string> = { select };
  for (const [key, value] of Object.entries(filters)) {
    params[key] = `eq.${value}`;
  }
  if (order) params.order = `${order}.${ascending ? 'asc' : 'desc'}`;
  if (typeof limit === 'number') params.limit = String(limit);

  const query = buildQuery(params);
  const key = useServiceRole ? serviceKey : supabaseAnonKey;
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: single ? 'application/vnd.pgrst.object+json' : 'application/json'
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Supabase select failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function supabaseInsert(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  { useServiceRole = false }: { useServiceRole?: boolean } = {}
) {
  const key = useServiceRole ? serviceKey : supabaseAnonKey;
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Supabase insert failed (${res.status})`);
  }

  return res.json();
}

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
