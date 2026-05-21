import type { Dict } from './dictionary'

/**
 * Russian translation. Keys missing from this file fall back to
 * English at runtime — so a partial translation always renders
 * something, never an empty span.
 *
 * Translator notes:
 * - "passkey" is left untransliterated (industry term).
 * - "Magic link" → "Magic-ссылка" (mixed-script is common in RU UX).
 * - {count}-style placeholders are interpolated by the i18n provider;
 *   keep the curly braces and the variable name exactly.
 */
export const ru: Partial<Dict> = {
  'common.signIn': 'Войти',
  'common.signOut': 'Выйти',
  'common.signUp': 'Зарегистрироваться',
  'common.cancel': 'Отмена',
  'common.save': 'Сохранить',
  'common.continue': 'Продолжить',
  'common.loading': 'Загрузка…',
  'common.email': 'Email',
  'common.password': 'Пароль',
  'common.name': 'Имя',

  'auth.welcome.title': 'Вход в INITE',
  'auth.welcome.subtitle': 'Выберите способ входа',
  'auth.method.passkey': 'Passkey',
  'auth.method.passkey.hint': 'Touch ID, Face ID или аппаратный ключ',
  'auth.method.magic': 'Magic-ссылка',
  'auth.method.magic.hint': 'Пришлём ссылку на почту',
  'auth.method.password': 'Пароль',
  'auth.method.password.hint': 'Классический вход по почте и паролю',
  'auth.recommended': 'Рекомендуем',

  'auth.password.title.login': 'Вход по паролю',
  'auth.password.title.register': 'Создать аккаунт',
  'auth.password.subtitle.login': 'Введите почту и пароль',
  'auth.password.subtitle.register': 'Регистрация по почте и паролю',
  'auth.password.cta.login': 'Войти',
  'auth.password.cta.register': 'Создать аккаунт',
  'auth.password.cta.loading.login': 'Входим…',
  'auth.password.cta.loading.register': 'Создаём аккаунт…',
  'auth.password.switch.toRegister': 'Нет аккаунта? Зарегистрироваться',
  'auth.password.switch.toLogin': 'Уже есть аккаунт? Войти',
  'auth.password.warning':
    'Вход по паролю оставлен для совместимости. Рекомендуем использовать Passkey — это безопаснее.',
  'auth.password.success.login': 'Вы вошли в систему',
  'auth.password.success.register': 'Аккаунт создан',
  'auth.password.error.breached':
    'Этот пароль засветился в {count} утечках. Выберите уникальный.',
  'auth.password.error.generic': 'Не удалось выполнить вход',
  'auth.password.error.fillFields': 'Заполните все поля',

  'auth.magic.title': 'Вход по email',
  'auth.magic.subtitle': 'Пришлём magic-ссылку для входа',
  'auth.magic.cta.send': 'Отправить ссылку',
  'auth.magic.cta.sending': 'Отправляем…',
  'auth.magic.sent.title': 'Проверьте почту',
  'auth.magic.sent.subtitle': 'Мы отправили magic-ссылку на',
  'auth.magic.sent.expiry':
    'Ссылка действует 15 минут. Если письма нет — проверьте папку «Спам».',
  'auth.magic.sent.useDifferent': 'Использовать другую почту',
  'auth.magic.howItWorks.title': 'Как это работает',
  'auth.magic.howItWorks.1': 'Введите свой email',
  'auth.magic.howItWorks.2': 'Откройте письмо',
  'auth.magic.howItWorks.3': 'Перейдите по ссылке — и вы внутри',
  'auth.magic.howItWorks.4': 'Никаких паролей',
  'auth.magic.error.generic': 'Не удалось отправить ссылку',
  'auth.magic.success': 'Ссылка отправлена — проверьте почту',

  'auth.passkey.title.login': 'Вход через Passkey',
  'auth.passkey.title.register': 'Создать Passkey',
  'auth.passkey.subtitle.login': 'Отпечаток, лицо или аппаратный ключ',
  'auth.passkey.subtitle.register':
    'Создайте Passkey — вход без пароля',
  'auth.passkey.cta.authenticate': 'Войти',
  'auth.passkey.cta.authenticating': 'Проверяем…',
  'auth.passkey.cta.register': 'Создать Passkey',
  'auth.passkey.cta.registering': 'Создаём…',
  'auth.passkey.switch.toRegister': 'Нет Passkey? Создать',
  'auth.passkey.switch.toLogin': 'Уже есть Passkey? Войти',
  'auth.passkey.mostSecure': 'Самый безопасный способ',
  'auth.passkey.mostSecureHint':
    'Passkey устойчивы к фишингу и не требуют пароля.',

  'validation.email.required': 'Укажите email',
  'validation.email.invalid': 'Введите корректный email',
  'validation.email.tooLong': 'Слишком длинный email',
  'validation.password.required': 'Введите пароль',
  'validation.password.tooShort': 'Пароль должен быть от 8 символов',

  'error.network': 'Сетевая ошибка — попробуйте ещё раз',
  'error.rateLimit': 'Слишком много попыток. Подождите немного.',

  'account.security.activity.title': 'Недавние события',
  'account.security.activity.subtitle':
    'Последние 20 событий безопасности по вашему аккаунту',
  'account.security.activity.empty': 'Пока нет событий.',
}
