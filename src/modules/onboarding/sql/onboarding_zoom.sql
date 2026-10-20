-- Модуль «Онбординг»: постоянная ссылка на звонок в Zoom (20 окт 2026)
alter table onboarding.onboardings add column if not exists zoom_url text;
notify pgrst, 'reload schema';
