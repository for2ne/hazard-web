# /try/solara — веб-воронка Solara

Рендерит **тот же** `/config/atmo/funnel.json`, что читает апка (один конфиг, два рендерера). Визуальный эталон — сама
апка (StepScaffold + FloTheme), не макеты. Парити-лист: `hazard-tools/marketing/solara/parity.sh app|web|sheet`.

## Режимы и параметры
- `/try/solara/` — сразу квиз (тест онборда). Вариант квиза выбирается по `webWeight` (апка смотрит только `weight`,
  поэтому веб-only варианты ставим `weight: 0`), липнет в localStorage.
- `?mode=store` — стор-подобная страница с иконкой A/B (тест иконки/скринов), отдельный ад-сет и трафик.
- `?v=<variantId>`, `?icon=a|b`, `?step=<stepId>|paywall` — принудительные значения для QA.
- Пейвол → `purchase_started` → до релиза waitlist (email в Mixpanel people), после релиза `STORE_LINK` = трекинг-ссылка
  Adapty с ответами в deferred-параметрах.

## События
Mixpanel (тот же токен, что в апке): `onboarding_step/answer/back`, `paywall_shown`, `plan_selected`, `purchase_started`,
`quiz_complete`, `waitlist_email`, `store_view`, `store_get_tap`; super props `variant, icon_variant, flow, utm_*, fbclid, platform=web`.
Pixel: PageView, ViewContent, GetTap, QuizStart, PaywallView, InitiateCheckout, QuizComplete, Lead.

## Грабли (не повторять)
- В апке нет прогресс-бара; назад — круглая кнопка 38pt. Заголовки вопросов слева 28pt, инфо-экранов по центру 30pt.
- Детали опций показываются только у выбранной. Optional textInput без Skip. Payoff = ✨, не орб.
- CTA sticky 56pt: плотный фон + `z-index` выше контента, иначе иконки карточек вылезают поверх кнопки.
- Flood-арт ≈ 46vh независимо от `imageHeight`.
- Лицо орба — геометрия FaceOrb из `FloHomeView.swift`, не рисовать «смайлик» на глаз.
- Дата рождения — нативный `<input type=date>` со стилизацией (системный пикер iOS), не селекты.
- Проверять в Safari симулятора, не в десктопном Chrome. GitHub Pages кэширует HTML 10 мин — бампать `?v=` у app.js.
