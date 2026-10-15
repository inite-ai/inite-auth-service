import type { Dict } from '../dictionary'

/** Account-area strings, Spanish (neutral Latin American). Merged into `es` by ../es.ts. */
export const esAccount: Partial<Dict> = {
  // ---------- Account ----------
  'account.title': 'Cuenta',
  'account.subtitle': 'Administra tu identidad, tus métodos de inicio de sesión y tus dispositivos.',
  'account.nav.profile': 'Perfil',
  'account.nav.security': 'Seguridad',
  'account.nav.access': 'Acceso',
  'account.nav.activity': 'Actividad',
  'account.nav.data': 'Tus datos',
  'account.error.title': 'No se pudo cargar esta sección',
  'account.error.retry': 'Reintentar',
  'account.footer': 'INITE Identity Provider · Tu identidad, bajo tu control',

  // Profile
  'account.profile.title': 'Perfil',
  'account.profile.subtitle': 'Cómo te ven en INITE',
  'account.profile.edit': 'Editar',
  'account.profile.anonymous': 'Cuenta sin nombre',
  'account.profile.field.name': 'Nombre visible',
  'account.profile.field.name.placeholder': 'Tu nombre',
  'account.profile.field.bio': 'Biografía',
  'account.profile.field.bio.placeholder': 'Una frase sobre ti',
  'account.profile.field.location': 'Ubicación',
  'account.profile.field.location.placeholder': 'Ciudad, país',
  'account.profile.field.profession': 'Profesión',
  'account.profile.field.profession.placeholder': 'A qué te dedicas',
  'account.profile.field.avatar': 'URL de la foto de perfil',
  'account.profile.field.avatar.helper':
    'Enlace a una imagen cuadrada. Déjalo vacío para usar tu inicial.',
  'account.profile.saved': 'Perfil actualizado',
  'account.profile.saveFailed': 'No se pudo actualizar el perfil',
  'account.profile.did': 'Identificador descentralizado',

  // Email
  'account.email.verified': 'Verificado',
  'account.email.unverified': 'Sin verificar',
  'account.email.verify': 'Verificar',
  'account.email.change': 'Cambiar correo',
  'account.email.resend': 'Reenviar verificación',
  'account.email.resent': 'Correo de verificación enviado',
  'account.email.pending.title': 'El cambio de correo está pendiente de confirmación',
  'account.email.pending.body':
    'Enviamos un enlace de confirmación a {email}. Tu correo cambiará en cuanto lo abras.',
  'account.email.pending.cancel': 'Cancelar cambio',
  'account.email.pending.cancelled': 'Cambio de correo cancelado',
  'account.email.sheet.title': 'Cambiar correo electrónico',
  'account.email.sheet.subtitle':
    'Enviaremos un enlace de confirmación al nuevo correo. Nada cambia hasta que lo abras.',
  'account.email.sheet.new': 'Nuevo correo electrónico',
  'account.email.sheet.password': 'Confirma con tu contraseña',
  'account.email.sheet.submit': 'Enviar enlace de confirmación',
  'account.email.sheet.sent': 'Enviamos el enlace de confirmación a tu nuevo correo',
  'account.email.error.same': 'Ese ya es tu correo electrónico',

  // Security overview
  'account.security.title': 'Seguridad',
  'account.security.subtitle': 'Cómo está protegida esta cuenta',
  'account.security.score': 'Protección de la cuenta',
  'account.security.score.strong': 'Alta',
  'account.security.score.fair': 'Se puede mejorar',
  'account.security.score.weak': 'Requiere atención',
  'account.security.todo': 'Siguiente paso recomendado',
  'account.security.done.email': 'Correo verificado',
  'account.security.done.password': 'Contraseña configurada',
  'account.security.done.twoFactor': 'Verificación en dos pasos activada',
  'account.security.done.passkeys': '{count} llave(s) de acceso',
  'account.security.done.wallets': '{count} billetera(s) vinculada(s)',
  'account.security.todo.email': 'Verifica tu correo electrónico',
  'account.security.todo.password': 'Crea una contraseña',
  'account.security.todo.twoFactor': 'Activa la verificación en dos pasos',
  'account.security.todo.passkeys': 'Agrega una llave de acceso',
  'account.security.todo.wallets': 'Vincula una billetera',

  // Password
  'account.password.title': 'Contraseña',
  'account.password.set': 'Contraseña configurada',
  'account.password.unset': 'Sin contraseña',
  'account.password.change': 'Cambiar',
  'account.password.create': 'Crear contraseña',
  'account.password.sheet.title': 'Cambiar contraseña',
  'account.password.sheet.subtitle':
    'Al cambiar tu contraseña, se cerrará tu sesión en todos los demás dispositivos.',
  'account.password.current': 'Contraseña actual',
  'account.password.new': 'Nueva contraseña',
  'account.password.confirm': 'Confirma la nueva contraseña',
  'account.password.rule.length': 'Al menos 8 caracteres',
  'account.password.rule.uppercase': 'Una letra mayúscula',
  'account.password.rule.number': 'Un número',
  'account.password.rule.match': 'Ambas contraseñas coinciden',
  'account.password.changed': 'Contraseña cambiada — se cerró la sesión en los demás dispositivos',
  'account.password.error.mismatch': 'Las contraseñas no coinciden',
  'account.password.error.rules': 'La nueva contraseña no cumple los requisitos',

  // Two-factor
  'account.twoFactor.title': 'Verificación en dos pasos',
  'account.twoFactor.on': 'App de autenticación activada',
  'account.twoFactor.off': 'Un código de tu teléfono, además de tu contraseña',
  'account.twoFactor.enable': 'Activar',
  'account.twoFactor.disable': 'Desactivar',
  'account.twoFactor.setup.title': 'Configura la verificación en dos pasos',
  'account.twoFactor.setup.step1': 'Escanea este código con tu app de autenticación',
  'account.twoFactor.setup.manual': 'O ingresa esta clave manualmente',
  'account.twoFactor.setup.step2': 'Ingresa el código de 6 dígitos que aparece',
  'account.twoFactor.setup.submit': 'Verificar y activar',
  'account.twoFactor.setup.enabled': 'La verificación en dos pasos está activada',
  'account.twoFactor.disable.title': 'Desactivar la verificación en dos pasos',
  'account.twoFactor.disable.warning':
    'Tu cuenta quedará protegida solo por tu contraseña.',
  'account.twoFactor.disable.submit': 'Desactivar',
  'account.twoFactor.disabled': 'Verificación en dos pasos desactivada',
  'account.twoFactor.code': 'Código de 6 dígitos',

  // Backup codes
  'account.backupCodes.title': 'Códigos de recuperación',
  'account.backupCodes.remaining': '{count} de 10 sin usar',
  'account.backupCodes.low':
    'Solo te quedan {count}. Genera un nuevo juego antes de que se acaben.',
  'account.backupCodes.none': 'No te quedan códigos de recuperación — genera un nuevo juego',
  'account.backupCodes.regenerate': 'Generar nuevos códigos',
  'account.backupCodes.saved.title': 'Guarda tus códigos de recuperación',
  'account.backupCodes.saved.body':
    'Cada código sirve una sola vez si pierdes tu app de autenticación. Es la única vez que los verás.',
  'account.backupCodes.copy': 'Copiar',
  'account.backupCodes.download': 'Descargar',
  'account.backupCodes.confirm': 'Ya los guardé',
  'account.backupCodes.copied': 'Códigos de recuperación copiados',
  'account.backupCodes.replaced': 'Se generaron nuevos códigos de recuperación — los anteriores ya no sirven',

  // Passkeys
  'account.passkeys.title': 'Llaves de acceso',
  'account.passkeys.subtitle': 'Inicia sesión con tu huella, tu rostro o una llave de seguridad',
  'account.passkeys.add': 'Agregar llave de acceso',
  'account.passkeys.empty': 'Aún no tienes llaves de acceso',
  'account.passkeys.empty.hint':
    'Una llave de acceso reemplaza tu contraseña con el desbloqueo de tu dispositivo — y no se puede robar con phishing.',
  'account.passkeys.added': 'Llave de acceso agregada',
  'account.passkeys.cancelled': 'Se canceló la configuración de la llave de acceso',
  'account.passkeys.remove': 'Eliminar llave de acceso',
  'account.passkeys.remove.confirm':
    'Ya no podrás iniciar sesión con esta llave de acceso.',
  'account.passkeys.removed': 'Llave de acceso eliminada',
  'account.passkeys.lastOne':
    'Es tu único método para entrar sin contraseña. Si la eliminas, solo podrás entrar con tu contraseña.',

  // Wallets
  'account.wallets.title': 'Billeteras vinculadas',
  'account.wallets.subtitle': 'Direcciones Web3 con las que puedes iniciar sesión en esta cuenta',
  'account.wallets.addEvm': 'Vincular EVM',
  'account.wallets.addTon': 'Vincular TON',
  'account.wallets.connecting': 'Esperando tu billetera…',
  'account.wallets.empty': 'No hay billeteras vinculadas',
  'account.wallets.empty.hint':
    'Vincula una dirección de Ethereum, Polygon, BSC o TON para iniciar sesión con tu billetera.',
  'account.wallets.linked': 'Billetera vinculada',
  'account.wallets.cancelled': 'Se canceló la conexión de la billetera',
  'account.wallets.proofRefused':
    'Tu billetera no envió la prueba de titularidad. Intenta conectarla de nuevo.',
  'account.wallets.unlink': 'Desvincular billetera',
  'account.wallets.unlink.confirm':
    'Ya no podrás iniciar sesión en tu cuenta con esta dirección.',
  'account.wallets.unlinked': 'Billetera desvinculada',
  'account.wallets.primary': 'Principal',

  // Sessions / connected apps
  'account.apps.title': 'Apps conectadas',
  'account.apps.subtitle': 'Aplicaciones a las que les diste acceso a tu cuenta de INITE. No te volverán a pedir permiso mientras sigan conectadas.',
  'account.apps.empty': 'No hay apps conectadas',
  'account.apps.empty.hint': 'Aquí aparecerán las apps que autorices en la pantalla de consentimiento.',
  'account.apps.granted': 'Autorizada {when}',
  'account.apps.disconnect': 'Desconectar',
  'account.apps.disconnect.confirm': '{name} perderá el acceso y se cerrará tu sesión ahí. La próxima vez te volverá a pedir permiso.',
  'account.apps.disconnected': 'App desconectada',
  'account.apps.agent': 'ID del agente',
  'account.apps.wallet': 'Puede pagar hasta ${per} por vez, ${day} al día, ${month} al mes',
  'account.sessions.title': 'Dónde tienes sesión iniciada',
  'account.sessions.subtitle': 'Apps y dispositivos con una sesión activa',
  'account.sessions.thisDevice': 'Este dispositivo',
  'account.sessions.unknownDevice': 'Dispositivo desconocido',
  'account.sessions.lastUsed': 'Último uso: {when}',
  'account.sessions.created': 'Iniciada {when}',
  'account.sessions.expires': 'Vence {when}',
  'account.sessions.expiringSoon': 'Vence en menos de un día',
  'account.sessions.revoke': 'Cerrar sesión',
  'account.sessions.revoke.confirm':
    'Esta app tendrá que volver a iniciar sesión para acceder a tu cuenta.',
  'account.sessions.revoked': 'Se cerró esa sesión',
  'account.sessions.revokeOthers': 'Cerrar las demás sesiones',
  'account.sessions.revokeOthers.confirm':
    'Se cerrará la sesión en todas las demás apps y dispositivos. Esta seguirá abierta.',
  'account.sessions.revokedOthers': 'Se cerraron las demás sesiones',
  'account.sessions.empty': 'No hay otras sesiones activas',
  'account.sessions.empty.hint':
    'Aquí aparecerán las apps en las que inicies sesión con tu cuenta de INITE.',
  'account.sessions.scopes': 'Acceso otorgado',

  // Activity
  'account.activity.title': 'Actividad reciente',
  'account.activity.subtitle': 'Eventos de seguridad de tu cuenta',
  'account.activity.empty': 'Aún no hay actividad registrada',
  'account.activity.empty.hint':
    'Aquí verás los inicios de sesión, los cambios de contraseña y las apps que autorices.',
  'account.activity.showAll': 'Ver los {count}',
  'account.activity.showLess': 'Ver menos',
  'account.activity.repeated': '{count}×',
  'account.activity.unknownDevice': 'dispositivo desconocido',

  // Data / danger zone
  'account.data.title': 'Tus datos',
  'account.data.subtitle': 'Exporta todo o cierra la cuenta para siempre',
  'account.data.export.title': 'Exportar tus datos',
  'account.data.export.body': 'Descarga todo lo que guardamos, en formato JSON',
  'account.data.export.cta': 'Exportar',
  'account.data.export.done': 'Exportación descargada',
  'account.data.delete.title': 'Eliminar cuenta',
  'account.data.delete.body': 'Elimina para siempre esta cuenta y todos sus datos',
  'account.data.delete.cta': 'Eliminar',
  'account.data.delete.sheet.title': '¿Eliminar tu cuenta?',
  'account.data.delete.sheet.warning':
    'Esta acción no se puede deshacer. Si quieres conservar tus datos, expórtalos primero.',
  'account.data.delete.sheet.list': 'Qué se elimina',
  'account.data.delete.item.identity': 'Tu perfil y tu identificador (DID)',
  'account.data.delete.item.wallets': 'Todas las billeteras vinculadas',
  'account.data.delete.item.passkeys': 'Todas las llaves de acceso',
  'account.data.delete.item.sessions': 'Todas las sesiones activas',
  'account.data.delete.item.credentials': 'Todas las credenciales emitidas',
  'account.data.delete.confirmLabel': 'Escribe {word} para confirmar',
  'account.data.delete.submit': 'Eliminar para siempre',
  'account.data.delete.done': 'Cuenta eliminada',

  // Legacy keys kept for the audit section's previous call sites.
  'account.security.activity.title': 'Actividad reciente',
  'account.security.activity.subtitle':
    'Los últimos 20 eventos de seguridad de tu cuenta',
  'account.security.activity.empty': 'Aún no hay actividad.',
}
