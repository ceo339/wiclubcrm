/**
 * WI Club CRM — отправка анкеты «Стать партнером Woman Insight» в CRM.
 *
 * Куда вставлять: открыть саму Google-ФОРМУ (не таблицу ответов) →
 * ⋮ → «Редактор скриптов» (Apps Script) → вставить этот код целиком.
 *
 * Один раз:
 * 1. Project Settings (шестерёнка) → Script Properties → Add:
 *      CRM_INTAKE_URL    = https://wiclubcrm.vercel.app/api/franchise/intake
 *      CRM_INTAKE_SECRET = то же значение, что FRANCHISE_INTAKE_SECRET в Vercel
 * 2. Triggers (будильник) → Add Trigger → функция onFormSubmitToCrm,
 *    источник «From form», тип «On form submit» → Save → разрешить доступ.
 * 3. Проверка: выбрать функцию testSendLatest и нажать Run —
 *    последний ответ формы отправится в CRM (дубль не создастся).
 */

function onFormSubmitToCrm(e) {
  sendResponse_(e.response);
}

function testSendLatest() {
  var responses = FormApp.getActiveForm().getResponses();
  if (!responses.length) throw new Error('В форме нет ответов');
  var result = sendResponse_(responses[responses.length - 1]);
  Logger.log(result);
}

function sendResponse_(response) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('CRM_INTAKE_URL');
  var secret = props.getProperty('CRM_INTAKE_SECRET');
  if (!url || !secret) throw new Error('Не заданы CRM_INTAKE_URL / CRM_INTAKE_SECRET в Script Properties');

  var answers = response.getItemResponses().map(function (ir) {
    return { title: ir.getItem().getTitle(), answer: ir.getResponse() };
  });

  var payload = {
    submitted_at: response.getTimestamp().toISOString(),
    email: response.getRespondentEmail() || '',
    answers: answers,
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  // До 3 попыток, если CRM временно недоступна.
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return res.getContentText();
    if (code === 401 || code === 400) throw new Error('CRM отклонила запрос (' + code + '): ' + res.getContentText());
    Utilities.sleep(2000 * attempt);
  }
  throw new Error('CRM не ответила после 3 попыток');
}
