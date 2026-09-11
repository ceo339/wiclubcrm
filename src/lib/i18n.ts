// Interface language — Russian (the default, Anastasiia's own working
// language) and Bulgarian (for the Sofia club's staff, who may not read
// Russian comfortably). Mirrors the currency architecture: a scoped
// preference per club/network, with a manual switcher in every header.
// Every amount/date still comes from the same data regardless of language —
// this only changes the words around it.

import { clubScopeForProfile } from "@/lib/scope";

export type Locale = "ru" | "bg";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "ru", label: "РУ" },
  { code: "bg", label: "БГ" },
];

/** The language the app is written in first; every key must have this. */
export const BASE_LOCALE: Locale = "ru";

export const LOCALE_STORAGE_KEY = "wiclub_locale";

/** Scoped exactly like currency's storage key — see scopeStorageKey in
 * currency.ts and clubScopeForProfile in scope.ts. */
export function localeScopeStorageKey(scope: string): string {
  return `${LOCALE_STORAGE_KEY}:${scope}`;
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ru" || value === "bg";
}

/**
 * Which language a club's own country normally works in — used as that
 * club's default interface language (Bulgaria's clubs default to
 * Bulgarian). Any other country defaults to Russian until a translation is
 * actually requested for it — Georgia's Batumi club stays Russian for now.
 */
export const COUNTRY_LOCALE: Record<string, Locale> = {
  Bulgaria: "bg",
};

export function localeForCountry(country: string | null | undefined): Locale {
  if (!country) return BASE_LOCALE;
  return COUNTRY_LOCALE[country] ?? BASE_LOCALE;
}

/**
 * Picks the language scope+default for a page from the signed-in profile,
 * the same way currency.ts's scopeForProfile does — a partner/staff account
 * gets its own club's language everywhere it goes, hq gets the network
 * default (Russian). Pages that show one specific club regardless of who's
 * looking build their own `club:<id>` scope directly instead.
 */
export function localeScopeForProfile(profile: {
  role: string;
  partner_id: string | null;
  partner_country: string | null;
}): { scope: string; fallback: Locale } {
  const scope = clubScopeForProfile(profile);
  const fallback = scope === "network" ? BASE_LOCALE : localeForCountry(profile.partner_country);
  return { scope, fallback };
}

type Entry = Record<Locale, string>;

/**
 * One flat dictionary for the whole app. Keys are grouped by area with a
 * short prefix (nav/b/f/s/... ) purely for human readability while
 * scrolling this file — the app only ever looks keys up by their full
 * string. Every key must have both `ru` and `bg`; `ru` is a straight copy
 * of the existing Russian text so this refactor changes no wording for
 * Russian users, only adds the Bulgarian side.
 */
export const DICT: Record<string, Entry> = {
  // ---- chrome / common ----
  appName: { ru: "WI Club CRM", bg: "WI Club CRM" },
  headingHome: { ru: "Обзор", bg: "Преглед" },
  close: { ru: "Закрыть", bg: "Затвори" },
  cancel: { ru: "Отмена", bg: "Отказ" },
  save: { ru: "Сохранить", bg: "Запази" },
  saving: { ru: "Сохранение…", bg: "Запазване…" },
  delete: { ru: "Удалить", bg: "Изтрий" },
  edit: { ru: "Редактировать", bg: "Редактирай" },
  add: { ru: "Добавить", bg: "Добави" },
  loading: { ru: "Загрузка…", bg: "Зареждане…" },
  yes: { ru: "Да", bg: "Да" },
  no: { ru: "Нет", bg: "Не" },
  dash: { ru: "—", bg: "—" },

  // ---- lead stages ----
  stageNew: { ru: "Новая заявка", bg: "Нова заявка" },
  stageProgress: { ru: "В работе", bg: "В процес" },
  stagePresented: { ru: "Записалась", bg: "Записана" },
  stageInvoiced: { ru: "Выставлен счет", bg: "Издадена фактура" },
  stagePaid: { ru: "Оплата", bg: "Плащане" },
  stageDeclined: { ru: "Отказ", bg: "Отказ" },

  // ---- lead sources ----
  sourceInstagram: { ru: "Instagram", bg: "Instagram" },
  sourceReferral: { ru: "Рекомендация", bg: "Препоръка" },
  sourceWebsite: { ru: "Сайт", bg: "Сайт" },
  sourceEvent: { ru: "Мероприятие", bg: "Събитие" },

  // ---- decline reasons ----
  declineNoMoney: { ru: "Нет денег", bg: "Няма пари" },
  declineExpensive: { ru: "Дорого", bg: "Скъпо" },
  declineNoTime: { ru: "Нет времени", bg: "Няма време" },
  declineNotRelevant: { ru: "Не актуально", bg: "Неактуално" },
  declineNotInCity: { ru: "Не в городе", bg: "Не е в града" },
  declineOther: { ru: "Другое", bg: "Друго" },

  // ---- generic membership/course plans ----
  planAnnual: { ru: "Годовое членство", bg: "Годишно членство" },
  planMonthly: { ru: "Ежемесячное членство", bg: "Месечно членство" },
  planCourse: { ru: "Курс «Женское лидерство»", bg: "Курс „Женско лидерство“" },
  planCoaching: { ru: "Личный коучинг", bg: "Личен коучинг" },

  // ---- member statuses ----
  sAwaiting: { ru: "Записалась · не оплатила", bg: "Записана · не платила" },
  sPaid: { ru: "Оплачено", bg: "Платено" },
  sCompleted: { ru: "Завершила курс", bg: "Завърши курса" },
  sFailed: { ru: "Не прошло", bg: "Не се състоя" },
  sRefunded: { ru: "Возврат", bg: "Възстановяване" },
  sCancelled: { ru: "Отменила запись", bg: "Отмени записа" },

  // ---- payment statuses ----
  payStatusPaid: { ru: "Оплачено", bg: "Платено" },
  payStatusPending: { ru: "Ожидается", bg: "Очаква се" },
  payStatusRefunded: { ru: "Возврат", bg: "Възстановяване" },

  // ---- months ----
  monthJan: { ru: "Январь", bg: "Януари" },
  monthFeb: { ru: "Февраль", bg: "Февруари" },
  monthMar: { ru: "Март", bg: "Март" },
  monthApr: { ru: "Апрель", bg: "Април" },
  monthMay: { ru: "Май", bg: "Май" },
  monthJun: { ru: "Июнь", bg: "Юни" },
  monthJul: { ru: "Июль", bg: "Юли" },
  monthAug: { ru: "Август", bg: "Август" },
  monthSep: { ru: "Сентябрь", bg: "Септември" },
  monthOct: { ru: "Октябрь", bg: "Октомври" },
  monthNov: { ru: "Ноябрь", bg: "Ноември" },
  monthDec: { ru: "Декабрь", bg: "Декември" },

  // ---- dashboard: deltas / trends ----
  deltaVsPrevMonth: { ru: "к прошлому месяцу", bg: "спрямо миналия месец" },
  deltaVsPrevMonthPts: { ru: "п.п. к прошлому месяцу", bg: "п.п. спрямо миналия месец" },
  deltaNoPrevMonth: { ru: "нет данных за прошлый месяц", bg: "няма данни за миналия месец" },
  deltaUnchanged: { ru: "без изменений {suffix}", bg: "без промяна {suffix}" },
  deltaChange: { ru: "{arrow} {value}% {suffix}", bg: "{arrow} {value}% {suffix}" },
  deltaChangePts: { ru: "{arrow} {value} {suffix}", bg: "{arrow} {value} {suffix}" },
  deltaNoLeadsInPeriod: { ru: "нет лидов за период", bg: "няма запитвания за периода" },

  // ---- dashboard: products-by-member breakdown ----
  productDeleted: { ru: "Удалённый курс", bg: "Изтрит курс" },
  productUnassigned: { ru: "Без привязки к курсу", bg: "Без обвързан курс" },

  // ---- dashboard: period filter ----
  btnShowPeriod: { ru: "Показать период", bg: "Покажи периода" },
  linkResetToMonths: { ru: "Сбросить к месяцам", bg: "Върни към месеци" },
  fieldFrom: { ru: "С", bg: "От" },
  fieldTo: { ru: "По", bg: "До" },
  metricsForPrefix: { ru: "Показатели за:", bg: "Показатели за:" },

  // ---- dashboard: stat tiles ----
  statRevenue: { ru: "Выручка", bg: "Приходи" },
  statMembers: { ru: "Участниц", bg: "Участнички" },
  statRoyaltyDue: { ru: "Роялти к оплате", bg: "Роялти за плащане" },
  statConversion: { ru: "Лид → участница", bg: "Запитване → участничка" },
  statLeadsTotal: { ru: "Лидов (всего)", bg: "Запитвания (общо)" },
  statCollectedTotal: { ru: "Собрано (всего)", bg: "Събрано (общо)" },
  statPending: { ru: "Ожидается", bg: "Очаква се" },
  deltaForPeriod: { ru: "за выбранный период", bg: "за избрания период" },
  deltaMembersAdded: { ru: "+{n} за период", bg: "+{n} за периода" },
  deltaMembersNone: { ru: "не добавлено за период", bg: "не са добавени за периода" },
  deltaRoyaltyPercent: { ru: "{percent}% от выручки за период", bg: "{percent}% от приходите за периода" },
  deltaNoRangeComparison: { ru: "без сравнения для периода", bg: "без сравнение за периода" },
  deltaAllTime: { ru: "за всё время", bg: "за цялото време" },
  deltaNotPaidYet: { ru: "ещё не оплачено", bg: "все още не е платено" },

  // ---- dashboard: funnel / breakdown headings ----
  headingFunnel: { ru: "Воронка лидов за период", bg: "Фуния на запитванията за периода" },
  funnelStart: { ru: "начало пути", bg: "начало на пътя" },
  funnelPctContinue: { ru: "{percent}% идут дальше", bg: "{percent}% продължават напред" },
  funnelDeclinedNote: {
    ru: "Из них в отказе за период: {n} — не входит в шаги выше: на каком именно шаге лид отказался, не отслеживается.",
    bg: "От тях в отказ за периода: {n} — не са включени в стъпките по-горе: на коя точно стъпка е отказало запитването, не се проследява.",
  },
  headingSourceConversion: { ru: "Какой канал приводит участниц", bg: "Кой канал води до участнички" },
  colSourcePctPaid: { ru: "% дошли до оплаты", bg: "% достигнали плащане" },
  sourceUnknown: { ru: "Источник не указан", bg: "Източникът не е посочен" },
  emptyNoLeadsPeriod: { ru: "Нет лидов за этот период.", bg: "Няма запитвания за този период." },
  headingProductsPeriod: { ru: "Участницы по продуктам — за период", bg: "Участнички по продукти — за периода" },
  headingProductsAllTime: { ru: "Участницы по продуктам — за всё время", bg: "Участнички по продукти — за цялото време" },
  headingClubsPeriod: { ru: "По клубам за период", bg: "По клубове за периода" },
  emptyNoMembersPeriod: { ru: "Нет участниц за этот период.", bg: "Няма участнички за този период." },
  emptyNoClubs: { ru: "В сети пока нет ни одного клуба.", bg: "В мрежата все още няма нито един клуб." },
  total: { ru: "Всего", bg: "Общо" },
  colClub: { ru: "Клуб", bg: "Клуб" },
  colLeads: { ru: "Лидов", bg: "Запитвания" },
  colCollected: { ru: "Собрано", bg: "Събрано" },

  // ---- dashboard: "требует внимания" ----
  headingStaleLeads: { ru: "Лиды без движения", bg: "Запитвания без движение" },
  emptyNoStaleLeads: {
    ru: "Нет лидов без движения дольше 5 дней — по всей сети.",
    bg: "Няма запитвания без движение повече от 5 дни — в цялата мрежа.",
  },
  colLead: { ru: "Лид", bg: "Запитване" },
  colDaysStuck: { ru: "Дней без движения", bg: "Дни без движение" },
  daysCount: { ru: "{n} дн.", bg: "{n} дни" },
  linkViewAllLeads: { ru: "Смотреть все лиды", bg: "Виж всички запитвания" },
  headingDecliningClubs: { ru: "Клубы с падающей выручкой", bg: "Клубове с падащи приходи" },
  emptyNoDecliningClubs: {
    ru: "Ни у одного клуба выручка не упала к прошлому месяцу.",
    bg: "Нито при един клуб приходите не са паднали спрямо миналия месец.",
  },

  // ---- dashboard: fourth-tile variants ----
  statClubsInNetwork: { ru: "Клубов в сети", bg: "Клубове в мрежата" },
  deltaActiveClubs: { ru: "действующих", bg: "активни" },
  statCourses: { ru: "Курсов", bg: "Курсове" },
  deltaActiveCourses: { ru: "активных", bg: "активни" },

  // ---- page headers / nav ----
  headingNetworkSummary: { ru: "Сводка по сети", bg: "Обобщение по мрежата" },

  // ---- attendance ----
  emptyNoMembersInStream: { ru: "В этом потоке пока нет ни одной участницы.", bg: "В този поток все още няма нито една участничка." },
  emptyNoSessions: {
    ru: "У этого курса не указано число занятий — добавьте его в разделе «Курсы», чтобы отмечать посещаемость.",
    bg: "За този курс не е посочен брой занятия — добавете го в раздел „Курсове“, за да отбелязвате присъствие.",
  },
  colMember: { ru: "Участница", bg: "Участничка" },
  sessionTitle: { ru: "Занятие {n} — {name}", bg: "Занятие {n} — {name}" },
  rowPresentCount: { ru: "Была на занятии", bg: "Присъствала на занятие" },

  // ---- home page ----
  roleLabelPartner: { ru: "Партнёр", bg: "Партньор" },
  roleLabelStaff: { ru: "Сотрудник клуба", bg: "Служител на клуба" },
  roleLabelHq: { ru: "HQ (головной офис)", bg: "Централен офис" },
  noClubAttached: { ru: "Без привязки к клубу", bg: "Без обвързан клуб" },
  signOut: { ru: "Выйти", bg: "Изход" },
  navHome: { ru: "Главная", bg: "Начало" },
  navNetworkSummaryDesc: {
    ru: "Лиды, участницы и оплаты по всей сети и по каждому клубу",
    bg: "Запитвания, участнички и плащания по цялата мрежа и по всеки клуб",
  },
  navMySummary: { ru: "Моя сводка", bg: "Моето обобщение" },
  navMySummaryDesc: {
    ru: "Выручка, роялти, конверсия и участницы по продуктам за период",
    bg: "Приходи, роялти, конверсия и участнички по продукти за периода",
  },
  navLeads: { ru: "Лиды", bg: "Запитвания" },
  navLeadsDesc: { ru: "Воронка продаж — канбан и список", bg: "Фуния на продажбите — канбан и списък" },
  navMembers: { ru: "Участницы", bg: "Участнички" },
  navMembersDesc: {
    ru: "Список участниц, статус оплаты, посещаемость",
    bg: "Списък с участнички, статус на плащане, присъствие",
  },
  navAttendance: { ru: "Посещаемость", bg: "Присъствие" },
  navAttendanceDesc: {
    ru: "Отметки за весь поток курса сразу, а не по одной участнице",
    bg: "Отбелязване за целия поток наведнъж, а не по една участничка",
  },
  navCourses: { ru: "Курсы", bg: "Курсове" },
  navCoursesDesc: {
    ru: "Продукты клуба и даты потоков — для формы «Новый лид»",
    bg: "Продукти на клуба и дати на потоците — за формата „Ново запитване“",
  },
  navPayments: { ru: "Оплаты", bg: "Плащания" },
  navPaymentsDesc: {
    ru: "Учёт оплат по участницам — отдельно от суммы на карточке",
    bg: "Отчитане на плащания по участнички — отделно от сумата в картата",
  },
  navPartners: { ru: "Клубы сети", bg: "Клубове в мрежата" },
  navPartnersDesc: {
    ru: "Добавить франчайзи — клуб и логин для входа",
    bg: "Добавяне на франчайзополучател — клуб и данни за вход",
  },
  navEmail: { ru: "Email", bg: "Имейл" },
  navEmailDesc: {
    ru: "Письма участницам и лидам, с реальной статистикой открытий",
    bg: "Писма до участнички и запитвания, с реална статистика на отваряния",
  },

  // ---- home page: "Мои задачи" widget ----
  headingMyTasks: { ru: "Мои задачи", bg: "Моите задачи" },
  headingNetworkTasks: { ru: "Задачи по сети", bg: "Задачи в мрежата" },
  emptyNoOpenTasks: { ru: "Открытых задач нет.", bg: "Няма открити задачи." },
  taskNoDueDate: { ru: "без срока", bg: "без срок" },

  // ---- load-error prefixes (page.tsx list screens) ----
  errLoadLeadsFailed: { ru: "Не удалось загрузить лиды", bg: "Неуспешно зареждане на запитванията" },
  errLoadMembersFailed: { ru: "Не удалось загрузить участниц", bg: "Неуспешно зареждане на участничките" },
  errLoadCoursesFailed: { ru: "Не удалось загрузить курсы", bg: "Неуспешно зареждане на курсовете" },
  errLoadPaymentsFailed: { ru: "Не удалось загрузить оплаты", bg: "Неуспешно зареждане на плащанията" },
  errLoadClubsFailed: { ru: "Не удалось загрузить клубы", bg: "Неуспешно зареждане на клубовете" },
  errLoadStreamsFailed: { ru: "Не удалось загрузить потоки", bg: "Неуспешно зареждане на потоците" },

  // ---- attendance list page ----
  courseDeleted: { ru: "Курс удалён", bg: "Курсът е изтрит" },
  noMembersCount: { ru: "нет участниц", bg: "няма участнички" },
  colCourse: { ru: "Курс", bg: "Курс" },
  colStartDate: { ru: "Дата начала", bg: "Начална дата" },
  colSessions: { ru: "Занятий", bg: "Занятия" },
  emptyNoStreams: {
    ru: "Пока нет ни одного потока курса — добавьте даты в разделе «Курсы», чтобы они появились здесь.",
    bg: "Все още няма нито един поток на курс — добавете дати в раздел „Курсове“, за да се появят тук.",
  },
  startsOn: { ru: "начало {date}", bg: "начало {date}" },

  // ---- login page ----
  authSubtitleSignIn: { ru: "Вход в систему", bg: "Влизане в системата" },
  authSubtitleSignUp: { ru: "Регистрация", bg: "Регистрация" },
  loginHeadline: {
    ru: "Создано для партнёров, которые закрывают сделки.",
    bg: "Създадено за партньори, които затварят сделки.",
  },
  loginSubtitle: {
    ru: "Войдите в свой кабинет партнёра WI Club CRM.",
    bg: "Влезте в своя партньорски профил на WI Club CRM.",
  },
  loginCardTitle: { ru: "С возвращением", bg: "Добре дошли отново" },
  authTabSignIn: { ru: "Вход", bg: "Вход" },
  fieldEmail: { ru: "Email", bg: "Email" },
  fieldPassword: { ru: "Пароль", bg: "Парола" },
  fieldFullName: { ru: "Имя", bg: "Име" },
  btnSignIn: { ru: "Войти", bg: "Влез" },
  btnCreateAccount: { ru: "Создать аккаунт", bg: "Създай акаунт" },
  // ---- leads board ----
  searchLeadsPlaceholder: { ru: "Поиск по имени, телефону, email…", bg: "Търсене по име, телефон, имейл…" },
  allSources: { ru: "Все источники", bg: "Всички източници" },
  viewKanban: { ru: "Канбан", bg: "Канбан" },
  viewList: { ru: "Список", bg: "Списък" },
  btnImport: { ru: "Импорт", bg: "Импорт" },
  btnAddLeadShort: { ru: "+ Лид", bg: "+ Запитване" },

  statLeadsPipeline: { ru: "В воронке", bg: "Във фунията" },
  deltaLeadsPipeline: { ru: "не оплачено и не отказано", bg: "неплатени и неотказани" },
  statPipelineValue: { ru: "Если все вступят", bg: "Ако всички се присъединят" },
  deltaPipelineValue: { ru: "сумма по активным лидам", bg: "сума по активните запитвания" },
  statNewThisWeek: { ru: "Новых за неделю", bg: "Нови тази седмица" },
  deltaNewThisWeek: { ru: "добавлено за 7 дней", bg: "добавени за 7 дни" },
  headingLeadSources: { ru: "Откуда приходят лиды", bg: "Откъде идват запитванията" },
  emptyNoLeadsForSources: { ru: "Пока нет лидов, чтобы показать источники.", bg: "Все още няма запитвания за показване на източници." },
  chipStuck: { ru: "Зависли 5+ дней", bg: "Забавени 5+ дни" },
  chipNewWeek: { ru: "Новые за неделю", bg: "Нови тази седмица" },
  chipHighValue: { ru: "Высокая ценность", bg: "Висока стойност" },
  declineModalTitle: { ru: "Причина отказа", bg: "Причина за отказ" },
  declineModalSubtitle: { ru: "Почему {name} отказывается?", bg: "Защо {name} отказва?" },
  fieldReason: { ru: "Причина", bg: "Причина" },
  fieldDescribeReason: { ru: "Описать причину", bg: "Опишете причината" },
  placeholderDescribeReason: { ru: "Опиши причину", bg: "Опишете причината" },
  btnConfirm: { ru: "Подтвердить", bg: "Потвърди" },
  emptyNoLeadsFiltered: { ru: "Лидов по этим фильтрам не найдено.", bg: "Няма запитвания по тези филтри." },
  colName: { ru: "Имя", bg: "Име" },
  colSource: { ru: "Источник", bg: "Източник" },
  colStage: { ru: "Стадия", bg: "Стадий" },
  colAmount: { ru: "Сумма", bg: "Сума" },
  colContacts: { ru: "Контакты", bg: "Контакти" },
  colAdded: { ru: "Добавлен", bg: "Добавен" },
  hqReadOnlyLeadsBanner: {
    ru: "Режим HQ: видны лиды всех клубов сети, доступно только для просмотра.",
    bg: "Режим HQ: видими са запитванията на всички клубове в мрежата, само за преглед.",
  },

  // ---- duplicate leads (HQ tool) ----
  btnFindDuplicates: { ru: "Найти дубли", bg: "Намери дубликати" },
  headingDuplicates: { ru: "Дубли лидов", bg: "Дублирани запитвания" },
  duplicatesSubtitle: {
    ru: "Совпадения по email (в первую очередь) или по номеру телефона, отдельно по каждому клубу.",
    bg: "Съвпадения по имейл (на първо място) или по телефонен номер, поотделно за всеки клуб.",
  },
  duplicatesEmptyState: { ru: "Дублей не найдено.", bg: "Не са намерени дубликати." },
  duplicatesGroupEmail: { ru: "Совпадение по email", bg: "Съвпадение по имейл" },
  duplicatesGroupPhone: { ru: "Совпадение по телефону", bg: "Съвпадение по телефон" },
  btnDeleteLead: { ru: "Удалить лид", bg: "Изтрий запитването" },
  confirmDeleteLead: { ru: "Удалить безвозвратно?", bg: "Да се изтрие безвъзвратно?" },

  signupSuccessMessage: {
    ru: "Аккаунт создан. Пока свяжитесь с администратором, чтобы привязать его к клубу-партнёру, — самостоятельный онбординг ещё не готов.",
    bg: "Акаунтът е създаден. Свържете се с администратора, за да го обвърже с клуб партньор — самостоятелното onboarding все още не е готово.",
  },

  // ---- lead detail modal ----
  fieldPhone: { ru: "Телефон", bg: "Телефон" },
  fieldCountry: { ru: "Страна", bg: "Държава" },
  fieldCity: { ru: "Город", bg: "Град" },
  fieldBirthday: { ru: "Дата рождения", bg: "Дата на раждане" },
  fieldInterestedIn: { ru: "Интересует", bg: "Интересува се от" },
  fieldCohortStart: { ru: "Начало потока", bg: "Начало на потока" },
  fieldNote: { ru: "Заметка", bg: "Бележка" },
  fieldValueEur: { ru: "Сумма (€)", bg: "Сума (€)" },
  btnConvertToMember: { ru: "Сделать участницей", bg: "Направи участничка" },
  convertedToMember: { ru: "Добавлена в «Участницы»", bg: "Добавена в „Участнички“" },
  chooseCourseOnConvert: { ru: "Выберите курс (необязательно)", bg: "Изберете курс (незадължително)" },
  btnConfirmConvert: { ru: "Подтвердить", bg: "Потвърди" },
  btnAddAnotherCourse: { ru: "+ Добавить курс", bg: "+ Добави курс" },
  errCourseNotFound: { ru: "Курс не найден", bg: "Курсът не е намерен" },
  errGeneric: { ru: "Что-то пошло не так", bg: "Нещо се обърка" },
  placeholderAddComment: { ru: "Добавить комментарий…", bg: "Добави коментар…" },
  placeholderNewTask: { ru: "Новая задача…", bg: "Нова задача…" },
  headingComments: { ru: "Комментарии", bg: "Коментари" },
  headingTasks: { ru: "Задачи", bg: "Задачи" },
  headingCourses: { ru: "Курсы", bg: "Курсове" },
  emptyNoComments: { ru: "Пока нет комментариев", bg: "Все още няма коментари" },
  emptyNoTasks: { ru: "Пока нет задач", bg: "Все още няма задачи" },
  emptyNoCoursesForMember: { ru: "Пока не записана ни на один курс", bg: "Все още не е записана в курс" },
  optionNotSpecified: { ru: "— не указано —", bg: "— не е посочено —" },
  btnAddTaskShort: { ru: "+ Задача", bg: "+ Задача" },

  // ---- new lead modal ----
  headingNewLead: { ru: "Новый лид", bg: "Ново запитване" },
  fieldSource: { ru: "Источник", bg: "Източник" },
  fieldCourseOptional: { ru: "Курс (необязательно)", bg: "Курс (незадължително)" },
  optionCourseNotChosen: { ru: "— не выбран —", bg: "— не е избран —" },
  optionNotChosen: { ru: "— не выбрано —", bg: "— не е избрано —" },
  optgroupMembership: { ru: "Членство", bg: "Членство" },
  emptyNoCohorts: { ru: "Нет запланированных потоков", bg: "Няма планирани потоци" },
  btnCreate: { ru: "Создать", bg: "Създай" },
  errDuplicateEmail: { ru: "Лид с таким email уже есть в базе.", bg: "Вече има запитване с този имейл." },
  errDuplicatePhone: { ru: "Лид с таким номером телефона уже есть в базе.", bg: "Вече има запитване с този телефонен номер." },
  duplicateExistingLead: { ru: "Уже в базе: {name}", bg: "Вече в базата: {name}" },
  btnAddAnyway: { ru: "Всё равно добавить", bg: "Добави въпреки това" },

  // ---- import leads modal ----
  headingImportLeads: { ru: "Импорт лидов из CSV", bg: "Импорт на запитвания от CSV" },
  importLeadsSubtitle: {
    ru: "Загрузите файл со списком контактов — первая строка должна быть заголовками колонок.",
    bg: "Качете файл със списък с контакти — първият ред трябва да съдържа заглавията на колоните.",
  },
  placeholderChooseCsv: { ru: "Выбрать CSV-файл", bg: "Избери CSV файл" },
  errSelectNameColumn: { ru: "Укажите, какая колонка содержит имя", bg: "Посочете коя колона съдържа името" },
  optionDoNotUse: { ru: "— не использовать —", bg: "— не използвай —" },
  previewHeading: { ru: "Предпросмотр (строк всего: {n})", bg: "Преглед (общо редове: {n})" },
  importedCount: { ru: "Импортировано лидов: {n}", bg: "Импортирани запитвания: {n}" },
  importedCountWithDuplicates: {
    ru: "Импортировано лидов: {n}, пропущено дублей: {d}",
    bg: "Импортирани запитвания: {n}, пропуснати дубликати: {d}",
  },
  errImportAllDuplicates: {
    ru: "Все строки — дубли уже существующих лидов, ничего не импортировано.",
    bg: "Всички редове са дубликати на съществуващи запитвания, нищо не е импортирано.",
  },
  btnImporting: { ru: "Импортирую…", bg: "Импортиране…" },
  btnImportCount: { ru: "Импортировать {n}", bg: "Импортирай {n}" },

  // ---- server action errors (shared across leads/members/payments/products/partners) ----
  errNotAuthorized: { ru: "Не авторизовано", bg: "Няма оторизация" },
  errHqNoClubGeneric: { ru: "У аккаунта HQ нет своего клуба.", bg: "Акаунтът на централния офис няма собствен клуб." },
  errHqNoClubAddLeads: {
    ru: "У аккаунта HQ нет своего клуба — добавлять лиды может только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — запитвания може да добавя само партньор.",
  },
  errHqNoClubImportLeads: {
    ru: "У аккаунта HQ нет своего клуба — импортировать лиды может только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — запитвания може да импортира само партньор.",
  },
  errHqNoClubEdit: {
    ru: "У аккаунта HQ нет своего клуба — редактировать может только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — редакция може да прави само партньор.",
  },
  errOnlyHqCanDelete: {
    ru: "Удалять лиды может только аккаунт «Управляющая компания».",
    bg: "Запитвания може да изтрива само акаунтът на централния офис.",
  },
  errEnterName: { ru: "Укажите имя", bg: "Въведете име" },
  errCommentEmpty: { ru: "Комментарий пустой", bg: "Коментарът е празен" },
  errEnterTaskText: { ru: "Укажите текст задачи", bg: "Въведете текст на задачата" },
  errLeadNotFound: { ru: "Лид не найден", bg: "Запитването не е намерено" },
  errNoRowsWithName: { ru: "Не найдено ни одной строки с именем", bg: "Не е намерен нито един ред с име" },
  errImportPartial: {
    ru: "Импортировано {imported} из {total}, затем ошибка: {message}",
    bg: "Импортирани {imported} от {total}, след което грешка: {message}",
  },

  // ---- members board ----
  searchMembersPlaceholder: { ru: "Поиск по имени, городу…", bg: "Търсене по име, град…" },
  allStatuses: { ru: "Все статусы", bg: "Всички статуси" },
  allCourses: { ru: "Все курсы", bg: "Всички курсове" },
  allStartDates: { ru: "Все даты старта", bg: "Всички начални дати" },
  countTotalMembers: { ru: "Всего участниц: {count}", bg: "Общо участнички: {count}" },
  countInCourse: { ru: "На курсе «{course}»: {count}", bg: "В курс „{course}“: {count}" },
  countInStream: { ru: "На курсе «{course}», поток {date}: {count}", bg: "В курс „{course}“, поток {date}: {count}" },
  btnResetFilter: { ru: "Сбросить фильтр", bg: "Изчисти филтъра" },
  btnAddMemberShort: { ru: "+ Участница", bg: "+ Участничка" },
  hqReadOnlyMembersBanner: {
    ru: "Режим HQ: видны участницы всех клубов сети, доступно только для просмотра.",
    bg: "Режим HQ: видими са участничките на всички клубове в мрежата, само за преглед.",
  },
  emptyNoMembersFiltered: { ru: "Участниц по этим фильтрам не найдено.", bg: "Няма участнички по тези филтри." },
  colStatus: { ru: "Статус", bg: "Статус" },
  colStart: { ru: "Начало", bg: "Начало" },

  // ---- member detail modal ----
  sincePrefix: { ru: "с {date}", bg: "от {date}" },
  fieldMemberSince: { ru: "Участница с", bg: "Участничка от" },
  headingAttendance: { ru: "Посещаемость", bg: "Присъствие" },
  attendanceSessionTitle: { ru: "Занятие {n}", bg: "Занятие {n}" },
  attendanceCycleHint: {
    ru: "Клик по занятию переключает: не отмечено → была → не была.",
    bg: "Клик върху занятие превключва: неотбелязано → присъствала → не присъствала.",
  },

  // ---- new member modal ----
  headingNewMember: { ru: "Новая участница", bg: "Нова участничка" },
  emptyNoCohortsForCourse: {
    ru: "У этого курса нет запланированных потоков — добавьте дату в разделе «Курсы».",
    bg: "Този курс няма планирани потоци — добавете дата в раздел „Курсове“.",
  },

  // ---- members server action errors ----
  errHqNoClubAddMembers: {
    ru: "У аккаунта HQ нет своего клуба — добавлять участниц может только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — участнички може да добавя само партньор.",
  },
  errMemberNotFound: { ru: "Участница не найдена", bg: "Участничката не е намерена" },

  // ---- payments board ----
  tileCollected: { ru: "Собрано", bg: "Събрано" },
  tileTotalRecords: { ru: "Всего записей", bg: "Общо записи" },
  btnAddPaymentLinkShort: { ru: "+ Ссылка на оплату", bg: "+ Линк за плащане" },
  btnAddPaymentShort: { ru: "+ Оплата", bg: "+ Плащане" },
  hqReadOnlyPaymentsBanner: {
    ru: "Режим HQ: видны оплаты всех клубов сети, доступно только для просмотра.",
    bg: "Режим HQ: видими са плащанията на всички клубове в мрежата, само за преглед.",
  },
  emptyNoPaymentsFiltered: { ru: "Оплат по этим фильтрам не найдено.", bg: "Няма плащания по тези филтри." },
  colDate: { ru: "Дата", bg: "Дата" },

  // ---- new payment modal ----
  headingNewPayment: { ru: "Новая оплата", bg: "Ново плащане" },
  optionSelectMember: { ru: "— выберите —", bg: "— изберете —" },
  emptyAddMemberFirst: {
    ru: "Сначала добавьте участницу в разделе «Участницы».",
    bg: "Първо добавете участничка в раздел „Участнички“.",
  },
  coursePrefix: { ru: "Курс: {name}", bg: "Курс: {name}" },

  // ---- edit payment modal ----
  fallbackPaymentTitle: { ru: "Оплата", bg: "Плащане" },
  paymentFromLeadOnly: { ru: "из лида, ещё не участница", bg: "от запитване, все още не е участничка" },

  // ---- payment link modal ----
  headingLinkReady: { ru: "Ссылка готова", bg: "Линкът е готов" },
  linkReadySubtitle: {
    ru: "Отправьте эту ссылку клиентке — после оплаты статус в списке обновится сам.",
    bg: "Изпратете този линк на клиентката — след плащане статусът в списъка ще се обнови автоматично.",
  },
  btnCopy: { ru: "Скопировать", bg: "Копирай" },
  btnCopied: { ru: "Скопировано", bg: "Копирано" },
  btnDone: { ru: "Готово", bg: "Готово" },
  headingPaymentLink: { ru: "Ссылка на оплату", bg: "Линк за плащане" },
  paymentLinkSubtitle: {
    ru: "Реальная онлайн-оплата картой (Stripe) — сейчас доступна для одного клуба сети.",
    bg: "Реално онлайн плащане с карта (Stripe) — в момента е достъпно за един клуб от мрежата.",
  },
  btnCreateLink: { ru: "Создать ссылку", bg: "Създай линк" },

  // ---- payments server action errors ----
  errHqNoClubAddPayments: {
    ru: "У аккаунта HQ нет своего клуба — добавлять оплаты может только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — плащания може да добавя само партньор.",
  },
  errSelectMember: { ru: "Выберите участницу", bg: "Изберете участничка" },
  errEnterAmount: { ru: "Укажите сумму", bg: "Въведете сума" },
  errHqNoClubCreateLinks: {
    ru: "У аккаунта HQ нет своего клуба — ссылки на оплату может создавать только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — линкове за плащане може да създава само партньор.",
  },
  errStripeNotConfigured: {
    ru: "Онлайн-оплата ещё не настроена для этого клуба (нет STRIPE_ENABLED_PARTNER_ID в переменных окружения).",
    bg: "Онлайн плащането все още не е настроено за този клуб (липсва STRIPE_ENABLED_PARTNER_ID в средата).",
  },
  errStripeOnlyOneClub: {
    ru: "Онлайн-оплата пока подключена только для одного клуба сети.",
    bg: "Онлайн плащането в момента е свързано само за един клуб в мрежата.",
  },
  errStripeSecretMissing: {
    ru: "Не настроен серверный ключ Stripe (STRIPE_SECRET_KEY).",
    bg: "Не е настроен сървърен ключ на Stripe (STRIPE_SECRET_KEY).",
  },
  errStripeNoUrl: { ru: "Stripe не вернул ссылку на оплату", bg: "Stripe не върна линк за плащане" },
  errCreateLinkFailed: { ru: "Не удалось создать ссылку на оплату", bg: "Неуспешно създаване на линк за плащане" },

  // ---- products board ----
  emptyNoCoursesYet: {
    ru: "Курсов пока нет — добавьте первый, чтобы он появился в форме «Новый лид».",
    bg: "Все още няма курсове — добавете първия, за да се появи във формата „Ново запитване“.",
  },
  coursesCountLabel: { ru: "Курсов: {n}", bg: "Курсове: {n}" },
  btnAddCourseShort: { ru: "+ Курс", bg: "+ Курс" },
  hqReadOnlyCoursesBanner: {
    ru: "Режим HQ: видны курсы всех клубов сети, доступно только для просмотра.",
    bg: "Режим HQ: видими са курсовете на всички клубове в мрежата, само за преглед.",
  },
  sessionsSuffix: { ru: "{n} занятий", bg: "{n} занятия" },
  headingCohorts: { ru: "Потоки", bg: "Потоци" },
  ariaDeleteCohort: { ru: "Удалить поток", bg: "Изтрий потока" },
  btnAddDateShort: { ru: "+ Дата", bg: "+ Дата" },
  confirmDeleteProduct: {
    ru: "Удалить курс «{name}»? Связанные лиды не удалятся, но потеряют привязку к курсу.",
    bg: "Изтриване на курс „{name}“? Свързаните запитвания няма да се изтрият, но ще загубят връзката с курса.",
  },

  // ---- new product modal ----
  headingNewCourse: { ru: "Новый курс", bg: "Нов курс" },
  fieldName: { ru: "Название", bg: "Наименование" },
  fieldPriceEur: { ru: "Цена (€)", bg: "Цена (€)" },
  fieldSessionsOptional: { ru: "Занятий (необязательно)", bg: "Занятия (незадължително)" },

  // ---- products server action errors ----
  errHqNoClubAddCourses: {
    ru: "У аккаунта HQ нет своего клуба — курсы может добавлять только партнёр.",
    bg: "Акаунтът на централния офис няма собствен клуб — курсове може да добавя само партньор.",
  },
  errEnterCourseName: { ru: "Укажите название курса", bg: "Въведете наименование на курса" },
  errEnterCohortStartDate: { ru: "Укажите дату начала потока", bg: "Въведете начална дата на потока" },

  // ---- partners board ----
  emptyNoClubsShort: { ru: "Клубов пока нет.", bg: "Все още няма клубове." },
  clubsInNetworkCountLabel: { ru: "Клубов в сети: {n}", bg: "Клубове в мрежата: {n}" },
  btnAddClubShort: { ru: "+ Клуб", bg: "+ Клуб" },
  emptyNoClubsAtAll: { ru: "Пока нет ни одного клуба.", bg: "Все още няма нито един клуб." },

  // ---- new partner modal ----
  headingClubCreated: { ru: "Клуб создан", bg: "Клубът е създаден" },
  clubCreatedSubtitle: {
    ru: "Передайте эти данные франчайзи для первого входа — пароль показывается только один раз и больше нигде не сохраняется.",
    bg: "Предайте тези данни на франчайзополучателя за първото влизане — паролата се показва само веднъж и никъде повече не се съхранява.",
  },
  fieldEmailColon: { ru: "Email: ", bg: "Email: " },
  fieldPasswordColon: { ru: "Пароль: ", bg: "Парола: " },
  clipboardCredentialsText: { ru: "Email: {email}\nПароль: {password}", bg: "Email: {email}\nПарола: {password}" },
  headingAddClub: { ru: "Добавить клуб", bg: "Добавяне на клуб" },
  fieldClubName: { ru: "Название клуба", bg: "Наименование на клуба" },
  optionSelectGeneric: { ru: "— выберите —", bg: "— изберете —" },
  fieldEmailForLogin: { ru: "Email для входа", bg: "Email за вход" },
  fieldReplyToEmail: { ru: "Email для ответов клиентам", bg: "Email за отговори на клиенти" },
  fieldReplyToEmailHint: {
    ru: "Настоящий почтовый ящик, который клуб реально читает — на него будут приходить ответы клиентов на письма. Необязательно.",
    bg: "Истинска пощенска кутия, която клубът реално чете — на нея ще пристигат отговорите на клиентите. Незадължително.",
  },

  // ---- edit partner modal ----
  headingEditClub: { ru: "Редактировать клуб", bg: "Редакция на клуб" },

  // ---- partners server action errors ----
  errHqOnlyAddClubs: { ru: "Добавлять клубы может только HQ", bg: "Клубове може да добавя само централният офис" },
  errEnterClubName: { ru: "Укажите название клуба", bg: "Въведете наименование на клуба" },
  errEnterCity: { ru: "Укажите город", bg: "Въведете град" },
  errEnterCountry: { ru: "Укажите страну", bg: "Въведете държава" },
  errEnterLoginEmail: { ru: "Укажите email для входа", bg: "Въведете email за вход" },
  errHqOnlyEditClubs: { ru: "Редактировать клубы может только HQ", bg: "Клубове може да редактира само централният офис" },
  errSupabaseServiceKeyMissing: {
    ru: "Не настроен серверный ключ Supabase (SUPABASE_SERVICE_ROLE_KEY) — добавьте его в переменные окружения на Vercel.",
    bg: "Не е настроен сървърен ключ на Supabase (SUPABASE_SERVICE_ROLE_KEY) — добавете го в променливите на средата във Vercel.",
  },
  errCreateLoginFailed: { ru: "Не удалось создать логин: {message}", bg: "Неуспешно създаване на вход: {message}" },

  // ---- Email campaigns ----
  headingEmail: { ru: "Email", bg: "Имейл" },
  btnNewCampaign: { ru: "Написать письмо", bg: "Ново писмо" },
  headingNewCampaign: { ru: "Новое письмо", bg: "Ново писмо" },
  fieldSubject: { ru: "Тема письма", bg: "Тема на писмото" },
  fieldBody: { ru: "Текст письма", bg: "Текст на писмото" },
  fieldAudience: { ru: "Кому", bg: "До кого" },
  audienceMembers: { ru: "Все участницы", bg: "Всички участнички" },
  audienceLeadsActive: { ru: "Активные лиды (не оплатившие, не отказавшиеся)", bg: "Активни запитвания (без платили и отказали)" },
  audienceLeadsAll: { ru: "Все лиды", bg: "Всички запитвания" },
  audienceSingle: { ru: "Лично", bg: "Лично" },
  btnWriteEmail: { ru: "Написать письмо", bg: "Напиши писмо" },
  emailSentToRecipient: { ru: "Письмо отправлено.", bg: "Писмото е изпратено." },
  errRecipientHasNoEmail: { ru: "На карточке нет email — некуда отправлять.", bg: "В картата няма имейл — няма къде да се изпрати." },
  audiencePreviewCount: { ru: "Получат письмо: {n}", bg: "Ще получат писмото: {n}" },
  audiencePreviewSkipped: {
    ru: "ещё {n} без email на карточке — им письмо не уйдёт",
    bg: "още {n} без имейл в картата — до тях писмото няма да стигне",
  },
  audiencePreviewLoading: { ru: "Считаем получателей…", bg: "Изчисляваме получателите…" },
  btnSendCampaign: { ru: "Отправить", bg: "Изпрати" },
  sendingCampaign: { ru: "Отправка…", bg: "Изпращане…" },
  colSubject: { ru: "Тема", bg: "Тема" },
  colAudience: { ru: "Кому", bg: "До кого" },
  colRecipients: { ru: "В списке", bg: "В списъка" },
  colOpenedPct: { ru: "Открыли", bg: "Отвориха" },
  colClickedPct: { ru: "Кликнули", bg: "Кликнаха" },
  colSentDate: { ru: "Отправлено", bg: "Изпратено" },
  campaignStatusSending: { ru: "Отправляется", bg: "Изпраща се" },
  campaignStatusSent: { ru: "Отправлено", bg: "Изпратено" },
  campaignStatusFailed: { ru: "Ошибка отправки", bg: "Грешка при изпращане" },
  emptyNoCampaigns: { ru: "Писем пока не было — начните с кнопки выше.", bg: "Все още няма писма — започнете с бутона по-горе." },
  emptyNoRecipients: { ru: "Получателей нет", bg: "Няма получатели" },
  recipientStatusQueued: { ru: "В очереди", bg: "На опашка" },
  recipientStatusSent: { ru: "Отправлено", bg: "Изпратено" },
  recipientStatusDelivered: { ru: "Доставлено", bg: "Доставено" },
  recipientStatusOpened: { ru: "Открыто", bg: "Отворено" },
  recipientStatusClicked: { ru: "Кликнули", bg: "Кликнаха" },
  recipientStatusBounced: { ru: "Не доставлено", bg: "Недоставено" },
  recipientStatusComplained: { ru: "Жалоба", bg: "Оплакване" },
  recipientStatusFailed: { ru: "Ошибка", bg: "Грешка" },
  statListSize: { ru: "В списке для рассылки", bg: "В списъка за разпращане" },
  deltaListBreakdown: { ru: "{members} участниц · {leads} лидов с email", bg: "{members} участнички · {leads} запитвания с имейл" },
  errEnterSubject: { ru: "Укажите тему письма", bg: "Въведете тема на писмото" },
  errEnterBody: { ru: "Укажите текст письма", bg: "Въведете текст на писмото" },
  errChooseAudience: { ru: "Выберите, кому отправить", bg: "Изберете до кого да изпратите" },
  errNoRecipientsWithEmail: {
    ru: "У выбранной аудитории нет ни одного email на карточке — отправлять некому.",
    bg: "При избраната аудитория няма нито един имейл в картите — няма на кого да изпратите.",
  },
  errResendNotConfigured: {
    ru: "Отправка писем не настроена (RESEND_API_KEY) — добавьте его в переменные окружения на Vercel.",
    bg: "Изпращането на писма не е настроено (RESEND_API_KEY) — добавете го в променливите на средата във Vercel.",
  },
  errSendFailed: {
    ru: "Не получилось отправить ни одного письма — проверьте настройку Resend (домен отправителя должен быть подтверждён).",
    bg: "Нито едно писмо не бе изпратено — проверете настройката на Resend (изпращащият домейн трябва да е потвърден).",
  },

  // ---- revenue trend widget ----
  headingRevenueTrend: { ru: "Динамика выручки", bg: "Динамика на прихода" },
  emptyNoRevenueHistory: { ru: "Пока недостаточно данных за прошлые месяцы.", bg: "Все още няма достатъчно данни за минали месеци." },

  // ---- attendance board (product + start-date filters) ----
  kAvgAttend: { ru: "Средняя посещаемость", bg: "Средно присъствие" },
  statEnrolled: { ru: "Записалось", bg: "Записани" },
  thProgress: { ru: "Прогресс", bg: "Прогрес" },
  prodSeats: { ru: "{n} записались", bg: "{n} записани" },

  // ---- payments board: month KPI tiles ----
  tileCollectedMonth: { ru: "Собрано в {month}", bg: "Събрано през {month}" },
  kExpected: { ru: "Ожидается от записавшихся", bg: "Очаква се от записалите се" },
  awaitingCount: { ru: "{n} записались, ещё не оплатили", bg: "{n} записани, все още не са платили" },

  // ---- products board: real pipeline/cohort counts ----
  prodEnrolled: { ru: "{n} в воронке", bg: "{n} във фунията" },
  prodPast: { ru: "Прошёл", bg: "Минал" },
  prodUpcoming: { ru: "Скоро", bg: "Предстои" },

  // ---- email board ----
  cLetters: { ru: "Письма", bg: "Писма" },
};

/**
 * Looks up `key` in the dictionary for `locale`. Server actions return
 * plain-text errors straight from Supabase/Stripe (never translated — see
 * the actions.ts files) alongside app-authored dictionary keys in the same
 * `{ error: string }` shape; client components call this on either without
 * knowing which they have. So a key that isn't in DICT is assumed to
 * already be display-ready text (a raw DB/API error message) and is
 * returned unchanged, rather than flagged — the earlier `[key]` marker was
 * only ever useful for catching a typo'd dictionary key, and that check
 * isn't worth breaking every untranslated error message for.
 */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[locale] : key;
  if (vars) {
    for (const k in vars) {
      s = s.split(`{${k}}`).join(String(vars[k]));
    }
  }
  return s;
}
