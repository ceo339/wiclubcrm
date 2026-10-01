/**
 * WI Club CRM — лиды Meta (Facebook/Instagram) из этой таблицы → CRM, клуб WiClub Sofia.
 *
 * КАК УСТАНОВИТЬ (один раз):
 * 1. В таблице: Расширения → Apps Script.
 * 2. Слева у «Файлы» нажмите «+» → «Скрипт», назовите CRM_Sofia и вставьте весь этот код.
 *    Если в проекте уже есть свой код (например, уведомления в Telegram) — НЕ трогайте его,
 *    этот файл отдельный, имена функций не пересекаются.
 * 3. Сохраните (иконка дискеты). В списке функций сверху выберите importNewLeadsToCRM_Sofia → «Выполнить».
 *    Google попросит разрешения — разрешите (скрипт читает эту таблицу и отправляет заявки в CRM).
 * 4. Слева «Триггеры» (будильник) → «Добавить триггер»:
 *    функция importNewLeadsToCRM_Sofia, источник «Время», «Таймер по минутам», каждые 15 минут → Сохранить.
 *
 * ЧТО ДЕЛАЕТ:
 * - Смотрит все листы, где есть выгрузка Meta (столбцы id, created_time, full_name / phone_number).
 *   Новые формы Meta обычно добавляют новый лист — он подхватится сам.
 * - Каждую новую строку отправляет в CRM: имя, телефон (без «p:»), источник (Instagram/Facebook),
 *   кампания / объявление / форма, ответы на вопросы формы — в заметку лида.
 * - В конце листа ведёт свой столбец crm_synced: время отправки или ERROR. Отправленные строки
 *   больше не трогает. Чтобы отправить строку заново — очистите её ячейку в crm_synced.
 * - Тестовые лиды Meta («test lead: dummy data…») пропускает и помечает TEST.
 */

var CRM_SOFIA_WEBHOOK_URL =
  'https://crm.womaninsight.club/api/leads/intake/47767f97-d787-46f8-9cf1-ad966eb278c0';
var CRM_SOFIA_SYNC_HEADER = 'crm_synced';

// Стандартные столбцы выгрузки Meta (всё остальное между ними — вопросы формы → в заметку).
var CRM_SOFIA_STANDARD = [
  'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id',
  'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
  'full_name', 'полное_имя', 'phone_number', 'номер_телефона', 'email', 'эл._адрес',
  'inbox_url', 'lead_status', CRM_SOFIA_SYNC_HEADER
];

function importNewLeadsToCRM_Sofia() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // предыдущий запуск ещё идёт
  try {
    var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    for (var i = 0; i < sheets.length; i++) CRM_Sofia_syncSheet_(sheets[i]);
  } finally {
    lock.releaseLock();
  }
}

function CRM_Sofia_syncSheet_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return;

  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
  var col = function (name) { return header.indexOf(name); };

  // Только листы с выгрузкой Meta.
  var nameCol = col('full_name') >= 0 ? col('full_name') : col('полное_имя');
  var phoneCol = col('phone_number') >= 0 ? col('phone_number') : col('номер_телефона');
  var emailCol = col('email') >= 0 ? col('email') : col('эл._адрес');
  if (col('id') < 0 || col('created_time') < 0 || nameCol < 0) return;

  // Свой столбец отметок — в конце листа.
  var syncCol = col(CRM_SOFIA_SYNC_HEADER);
  if (syncCol < 0) {
    syncCol = lastCol;
    sheet.getRange(1, syncCol + 1).setValue(CRM_SOFIA_SYNC_HEADER);
    lastCol = syncCol + 1;
    header.push(CRM_SOFIA_SYNC_HEADER);
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (String(row[syncCol] || '').trim() !== '') continue; // уже обработана
    if (String(row[col('id')] || '').trim() === '') continue; // пустая строка

    var cell = sheet.getRange(r + 2, syncCol + 1);
    var rowText = row.join(' ');
    if (rowText.indexOf('test lead: dummy data') >= 0) {
      cell.setValue('TEST');
      continue;
    }

    var get = function (c) { return c >= 0 ? String(row[c] || '').trim() : ''; };
    var phone = get(phoneCol).replace(/^p:/, '').trim();
    var email = get(emailCol);

    // Ответы на вопросы формы → заметка.
    var answers = [];
    for (var c = 0; c < header.length; c++) {
      if (CRM_SOFIA_STANDARD.indexOf(header[c]) >= 0 || !header[c]) continue;
      var v = String(row[c] || '').trim();
      if (v) answers.push(header[c].replace(/_/g, ' ') + ': ' + v);
    }

    var payload = {
      name: get(nameCol),
      phone: phone,
      email: email,
      utm_source: get(col('platform')) || 'meta', // ig → Instagram, fb → Facebook; пусто → Facebook
      utm_medium: 'lead_form',
      utm_campaign: get(col('campaign_name')),
      utm_content: get(col('ad_name')),
      utm_term: get(col('form_name')),
      note: answers.join('\n')
    };

    if (!payload.name || (!payload.phone && !payload.email)) {
      cell.setValue('ERROR: нет имени или телефона');
      continue;
    }

    try {
      var res = UrlFetchApp.fetch(CRM_SOFIA_WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        cell.setValue(new Date());
      } else {
        cell.setValue('ERROR ' + code + ': ' + res.getContentText().slice(0, 200));
      }
    } catch (e) {
      cell.setValue('ERROR: ' + e);
    }
  }
}
