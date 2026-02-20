const requiredVars = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
] as const;

const optionalCompatVars = ['NEXT_PUBLIC_SUPABASE_URL'] as const;

export function assertEnv() {
  for (const key of requiredVars) {
    if (!process.env[key]) {
      console.warn(`Missing env var: ${key}`);
    }
  }

  for (const key of optionalCompatVars) {
    if (process.env[key]) {
      console.warn(`Compatibility env var detected: ${key}. Prefer SUPABASE_URL.`);
    }
  }
}
