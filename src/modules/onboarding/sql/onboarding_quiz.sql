-- Квизы по материалам онбординга (применено в Supabase 21.10.2026 как миграция onboarding_quiz).
create table if not exists onboarding.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  template_item_id uuid not null references onboarding.template_items(id) on delete cascade,
  sort int not null default 0,
  question text not null,
  options text[] not null,
  correct int not null,
  explanation text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists onboarding.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references onboarding.onboardings(id) on delete cascade,
  plan_item_id uuid not null references onboarding.plan_items(id) on delete cascade,
  template_item_id uuid not null references onboarding.template_items(id) on delete cascade,
  answers jsonb not null,
  score int not null,
  total int not null,
  passed boolean not null,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table onboarding.quiz_questions enable row level security;
alter table onboarding.quiz_attempts enable row level security;
-- вопросы с ответами видит только сеть (hq/viewer); партнер получает их без ответов через серверное действие
create policy quiz_q_read on onboarding.quiz_questions for select using (can_view_network());
create policy quiz_a_read on onboarding.quiz_attempts for select using (exists (select 1 from onboarding.onboardings o where o.id = quiz_attempts.onboarding_id and (can_view_network() or o.partner_id = (select current_partner_id()))));
