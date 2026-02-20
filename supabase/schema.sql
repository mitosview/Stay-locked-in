-- Extensions
create extension if not exists "pgcrypto";

-- Profiles for auth users
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_athlete_memberships (
  coach_id uuid not null references public.coaches(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  week_start_date date not null,
  weight numeric,
  energy int check (energy between 1 and 10),
  hunger int check (hunger between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  start_date date not null,
  macros jsonb not null,
  cardio text,
  steps int,
  notes text,
  created_by uuid not null references public.coaches(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_outputs (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  output_type text not null,
  content jsonb not null,
  model_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  message_text text not null,
  sent_at timestamptz not null default now()
);

alter table public.coaches enable row level security;
alter table public.athletes enable row level security;
alter table public.coach_athlete_memberships enable row level security;
alter table public.checkins enable row level security;
alter table public.plans enable row level security;
alter table public.ai_outputs enable row level security;
alter table public.messages enable row level security;

-- Enforce RLS even for table owners in application queries.
alter table public.coaches force row level security;
alter table public.athletes force row level security;
alter table public.coach_athlete_memberships force row level security;
alter table public.checkins force row level security;
alter table public.plans force row level security;
alter table public.ai_outputs force row level security;
alter table public.messages force row level security;

create or replace function public.current_coach_id()
returns uuid
language sql
stable
as $$
  select id from public.coaches where user_id = auth.uid()
$$;

create or replace function public.current_athlete_id()
returns uuid
language sql
stable
as $$
  select id from public.athletes where user_id = auth.uid()
$$;

create or replace function public.is_coach_of_athlete(_coach_user_id uuid, _athlete_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.coach_athlete_memberships m
    join public.coaches c on c.id = m.coach_id
    where c.user_id = _coach_user_id
      and m.athlete_id = _athlete_id
      and m.status = 'active'
  );
$$;

-- Coaches can access only active linked athletes' data.
create policy "coach reads athletes linked to them"
on public.athletes for select
using (
  exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = public.current_coach_id()
      and m.athlete_id = athletes.id
      and m.status = 'active'
  )
);

create policy "athletes read own athlete row"
on public.athletes for select
using (id = public.current_athlete_id());

create policy "athlete can read self"
on public.athletes
for select
using (user_id = auth.uid());

create policy "athlete can update self"
on public.athletes
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "coach can read linked athletes"
on public.athletes
for select
using (public.is_coach_of_athlete(auth.uid(), id));


create policy "coaches read/write own memberships"
on public.coach_athlete_memberships for all
using (coach_id = public.current_coach_id())
with check (coach_id = public.current_coach_id());

create policy "athletes read own memberships"
on public.coach_athlete_memberships for select
using (athlete_id = public.current_athlete_id());

create policy "coach can read own memberships"
on public.coach_athlete_memberships
for select
using (
  exists (
    select 1 from public.coaches c
    where c.id = coach_id and c.user_id = auth.uid()
  )
);

-- Optional: allow coach to create memberships for themselves (invites)
create policy "coach can create memberships for self"
on public.coach_athlete_memberships
for insert
with check (
  exists (
    select 1 from public.coaches c
    where c.id = coach_id and c.user_id = auth.uid()
  )
);

-- Optional: allow coach to update membership status for themselves
create policy "coach can update own memberships"
on public.coach_athlete_memberships
for update
using (
  exists (
    select 1 from public.coaches c
    where c.id = coach_id and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.coaches c
    where c.id = coach_id and c.user_id = auth.uid()
  )
);


create policy "athletes rw own checkins"
on public.checkins for all
using (athlete_id = public.current_athlete_id())
with check (athlete_id = public.current_athlete_id());

create policy "coaches rw active athlete checkins"
on public.checkins for all
using (
  exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = public.current_coach_id()
      and m.athlete_id = checkins.athlete_id
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = public.current_coach_id()
      and m.athlete_id = checkins.athlete_id
      and m.status = 'active'
  )
);

create policy "athlete can read own checkins"
on public.checkins
for select
using (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
);

create policy "athlete can insert own checkins"
on public.checkins
for insert
with check (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
);

create policy "athlete can update own checkins"
on public.checkins
for update
using (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
);

create policy "coach can read linked checkins"
on public.checkins
for select
using (public.is_coach_of_athlete(auth.uid(), athlete_id));


create policy "athletes rw own plans read only"
on public.plans for select
using (athlete_id = public.current_athlete_id());

create policy "coaches rw active athlete plans"
on public.plans for all
using (
  exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = public.current_coach_id()
      and m.athlete_id = plans.athlete_id
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = public.current_coach_id()
      and m.athlete_id = plans.athlete_id
      and m.status = 'active'
  )
);

create policy "athlete can read own plans"
on public.plans
for select
using (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
);

create policy "coach can read linked plans"
on public.plans
for select
using (public.is_coach_of_athlete(auth.uid(), athlete_id));

create policy "coach can insert linked plans"
on public.plans
for insert
with check (public.is_coach_of_athlete(auth.uid(), athlete_id));

create policy "coach can update linked plans"
on public.plans
for update
using (public.is_coach_of_athlete(auth.uid(), athlete_id))
with check (public.is_coach_of_athlete(auth.uid(), athlete_id));


create policy "athletes read own messages"
on public.messages for select
using (athlete_id = public.current_athlete_id());

create policy "coaches rw active athlete messages"
on public.messages for all
using (
  coach_id = public.current_coach_id()
  and exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = messages.coach_id
      and m.athlete_id = messages.athlete_id
      and m.status = 'active'
  )
)
with check (
  coach_id = public.current_coach_id()
  and exists (
    select 1 from public.coach_athlete_memberships m
    where m.coach_id = messages.coach_id
      and m.athlete_id = messages.athlete_id
      and m.status = 'active'
  )
);

create policy "athlete can read own messages"
on public.messages
for select
using (
  exists (
    select 1 from public.athletes a
    where a.id = athlete_id and a.user_id = auth.uid()
  )
);

create policy "coach can read linked messages"
on public.messages
for select
using (public.is_coach_of_athlete(auth.uid(), athlete_id));

create policy "coach can insert linked messages"
on public.messages
for insert
with check (public.is_coach_of_athlete(auth.uid(), athlete_id));

create policy "athletes read own ai outputs"
on public.ai_outputs for select
using (
  exists (
    select 1 from public.checkins c
    where c.id = ai_outputs.checkin_id
      and c.athlete_id = public.current_athlete_id()
  )
);

create policy "coaches rw ai outputs for active athletes"
on public.ai_outputs for all
using (
  exists (
    select 1 from public.checkins c
    join public.coach_athlete_memberships m on m.athlete_id = c.athlete_id
    where c.id = ai_outputs.checkin_id
      and m.coach_id = public.current_coach_id()
      and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.checkins c
    join public.coach_athlete_memberships m on m.athlete_id = c.athlete_id
    where c.id = ai_outputs.checkin_id
      and m.coach_id = public.current_coach_id()
      and m.status = 'active'
  )
);

create policy "athlete can read own ai_outputs"
on public.ai_outputs
for select
using (
  exists (
    select 1
    from public.checkins ci
    join public.athletes a on a.id = ci.athlete_id
    where ci.id = checkin_id
      and a.user_id = auth.uid()
  )
);

create policy "coach can read linked ai_outputs"
on public.ai_outputs
for select
using (
  exists (
    select 1
    from public.checkins ci
    where ci.id = checkin_id
      and public.is_coach_of_athlete(auth.uid(), ci.athlete_id)
  )
);

-- No client inserts/updates to ai_outputs (recommended)


create policy "coach can read own profile"
on public.coaches
for select
using (user_id = auth.uid());

create policy "coach can update own profile"
on public.coaches
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "coaches read own coach row"
on public.coaches for select
using (id = public.current_coach_id());
