import type { Dict } from '../dictionary'

/** INITE wallet strings, Spanish. Merged into `es` by ../es.ts. */
export const esWallet: Partial<Dict> = {
  'account.initeWallet.title': 'Billetera INITE',
  'account.initeWallet.subtitle':
    'Tus propios USDC en la red Base. Solo tu passkey puede moverlos. Tus agentes de IA pagan con ella dentro de los límites que apruebes.',
  'account.initeWallet.unavailable': 'La billetera INITE aún no está disponible',
  'account.initeWallet.loadFailed': 'No se pudo cargar la billetera.',
  'account.initeWallet.empty': 'Todavía no tienes billetera',
  'account.initeWallet.empty.hint':
    'Se crea con una passkey nueva. La passkey es la única llave de la billetera: INITE no puede mover tu dinero.',
  'account.initeWallet.create': 'Crear billetera',
  'account.initeWallet.created': 'Billetera creada',
  'account.initeWallet.cancelled': 'Solicitud de passkey cerrada',
  'account.initeWallet.balance': 'Saldo',
  'account.initeWallet.address': 'Dirección de la billetera en Base',
  'account.initeWallet.topUp': 'Recargar',
  'account.initeWallet.withdraw': 'Retirar',
  'account.initeWallet.history': 'Movimientos recientes',
  'account.initeWallet.history.topup': 'Recarga por {rail}',
  'account.initeWallet.history.withdrawal': 'Enviado a {to}',
  'account.initeWallet.safety':
    'Mantén sincronizada la passkey de la billetera (Llavero de iCloud, Gestor de contraseñas de Google, un gestor de contraseñas). Perder todas sus copias significa perder el acceso a la billetera.',
  'account.initeWallet.done': 'Listo',
  'account.initeWallet.status.pending': 'En espera',
  'account.initeWallet.status.paid': 'Pagado',
  'account.initeWallet.status.completed': 'Acreditado',
  'account.initeWallet.status.expired': 'Vencido',
  'account.initeWallet.status.failed': 'Falló',
  'account.initeWallet.status.refunded': 'Reembolsado',
  'account.initeWallet.status.signing': 'Firmando',
  'account.initeWallet.status.submitted': 'Enviado',
  'account.initeWallet.status.mined': 'Enviado',
  'account.initeWallet.status.reverted': 'Rechazado por la red',
  'account.initeWallet.topUp.title': 'Recargar la billetera',
  'account.initeWallet.topUp.transfer': 'Transferencia',
  'account.initeWallet.topUp.transfer.hint':
    'Envía USDC en la red Base a esta dirección. Otros tokens, o USDC en otras redes, se perderán.',
  'account.initeWallet.topUp.pix.amount': 'Monto, R$',
  'account.initeWallet.topUp.pix.create': 'Obtener código PIX',
  'account.initeWallet.topUp.pix.hint':
    'Paga este PIX desde la app de tu banco. Hodle convierte los reales y entrega USDC en tu billetera, normalmente en pocos minutos.',
  'account.initeWallet.topUp.pix.code': 'Código PIX para copiar y pegar',
  'account.initeWallet.topUp.pix.waiting': 'Esperando el pago…',
  'account.initeWallet.topUp.pix.done': 'Los USDC van en camino a tu billetera.',
  'account.initeWallet.withdraw.title': 'Retirar USDC',
  'account.initeWallet.withdraw.to': 'Dirección del destinatario en Base',
  'account.initeWallet.withdraw.amount': 'Monto, USDC',
  'account.initeWallet.withdraw.hint':
    'Confirmas con la passkey de la billetera. INITE paga la comisión de la red.',
  'account.initeWallet.withdraw.submit': 'Confirmar con passkey',
  'account.initeWallet.withdraw.sent': 'Enviado.',
  'account.initeWallet.withdraw.pending': 'Enviado. Esperando la confirmación de la red.',
}
