import type { Dict } from '../dictionary';

/** INITE wallet strings, Russian. Merged into `ru` by ../ru.ts. */
export const ruWallet: Partial<Dict> = {
  'account.initeWallet.title': 'Кошелёк INITE',
  'account.initeWallet.subtitle':
    'Ваши собственные USDC в сети Base. Двигать их может только ваш passkey. Ваши ИИ-агенты платят из кошелька в пределах лимитов, которые вы одобрили.',
  'account.initeWallet.unavailable': 'Кошелёк INITE пока недоступен',
  'account.initeWallet.loadFailed': 'Не удалось загрузить кошелёк.',
  'account.initeWallet.empty': 'Кошелька пока нет',
  'account.initeWallet.empty.hint':
    'Он создаётся с новым passkey. Passkey — единственный ключ к кошельку: INITE не может распоряжаться вашими деньгами.',
  'account.initeWallet.create': 'Создать кошелёк',
  'account.initeWallet.created': 'Кошелёк создан',
  'account.initeWallet.cancelled': 'Запрос passkey закрыт',
  'account.initeWallet.balance': 'Баланс',
  'account.initeWallet.address': 'Адрес кошелька в Base',
  'account.initeWallet.topUp': 'Пополнить',
  'account.initeWallet.withdraw': 'Вывести',
  'account.initeWallet.history': 'Последние операции',
  'account.initeWallet.history.topup': 'Пополнение через {rail}',
  'account.initeWallet.history.withdrawal': 'Отправлено на {to}',
  'account.initeWallet.safety':
    'Держите passkey кошелька синхронизированным (Связка ключей iCloud, Google Password Manager, менеджер паролей). Если потерять все его копии, доступ к кошельку пропадёт.',
  'account.initeWallet.done': 'Готово',
  'account.initeWallet.status.pending': 'Ожидает',
  'account.initeWallet.status.paid': 'Оплачено',
  'account.initeWallet.status.completed': 'Зачислено',
  'account.initeWallet.status.expired': 'Истекло',
  'account.initeWallet.status.failed': 'Не прошло',
  'account.initeWallet.status.refunded': 'Возвращено',
  'account.initeWallet.status.signing': 'Подписывается',
  'account.initeWallet.status.submitted': 'Отправлено',
  'account.initeWallet.status.mined': 'Отправлено',
  'account.initeWallet.status.reverted': 'Сеть отклонила',
  'account.initeWallet.topUp.title': 'Пополнение кошелька',
  'account.initeWallet.topUp.transfer': 'Перевод',
  'account.initeWallet.topUp.transfer.hint':
    'Отправьте USDC в сети Base на этот адрес. Другие токены и USDC в других сетях будут потеряны.',
  'account.initeWallet.topUp.pix.amount': 'Сумма, R$',
  'account.initeWallet.topUp.pix.create': 'Получить код PIX',
  'account.initeWallet.topUp.pix.hint':
    'Оплатите этот PIX в приложении банка. Hodle конвертирует реалы и зачислит USDC на кошелёк, обычно за несколько минут.',
  'account.initeWallet.topUp.pix.code': 'Код PIX для вставки',
  'account.initeWallet.topUp.pix.waiting': 'Ждём оплату…',
  'account.initeWallet.topUp.pix.done': 'USDC идут на ваш кошелёк.',
  'account.initeWallet.withdraw.title': 'Вывод USDC',
  'account.initeWallet.withdraw.to': 'Адрес получателя в Base',
  'account.initeWallet.withdraw.amount': 'Сумма, USDC',
  'account.initeWallet.withdraw.hint':
    'Подтверждаете passkey кошелька. Комиссию сети оплачивает INITE.',
  'account.initeWallet.withdraw.submit': 'Подтвердить passkey',
  'account.initeWallet.withdraw.sent': 'Отправлено.',
  'account.initeWallet.withdraw.pending': 'Отправлено. Ждём подтверждения сети.',
  'account.initeWallet.agents.title': 'ИИ-агенты',
  'account.initeWallet.agents.status.pending': 'Ждёт вас',
  'account.initeWallet.agents.status.active': 'Может платить',
  'account.initeWallet.agents.status.revoked': 'Отключён',
  'account.initeWallet.agents.usage':
    'Сегодня ${today} из ${daily} · в этом месяце ${month} из ${monthly} · до ${each} за платёж',
  'account.initeWallet.agents.waiting':
    'Просит платить из вашего кошелька. Задайте лимиты и одобрите passkey кошелька.',
  'account.initeWallet.agents.approve': 'Посмотреть',
  'account.initeWallet.agents.revoke': 'Отключить',
  'account.initeWallet.agents.revoke.confirm':
    'Агент больше не сможет платить из кошелька. Уже сделанные платежи останутся.',
  'account.initeWallet.agents.revoked': 'Агент отключён',
  'account.initeWallet.agents.approved': 'Агент одобрен',
  'account.initeWallet.agents.approveTitle': 'Разрешить {name} платить',
  'account.initeWallet.agents.approveHint':
    'Агент сам платит на сайтах с x402 в пределах этих лимитов. Отключить его можно в любой момент.',
  'account.initeWallet.agents.perPayment': 'До, за платёж ($)',
  'account.initeWallet.agents.daily': 'До, в день ($)',
  'account.initeWallet.agents.monthly': 'До, в месяц ($)',
  'account.initeWallet.agents.merchants': 'Только на: {sites}',
  'account.initeWallet.agents.twice':
    'Браузер дважды попросит passkey кошелька: чтобы добавить агента и чтобы задать его лимит на платёж.',
  'account.initeWallet.agents.confirm': 'Одобрить passkey',
};
