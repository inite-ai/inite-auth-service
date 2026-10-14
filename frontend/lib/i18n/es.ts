import type { Dict } from './dictionary'
import { esAccount } from './account/es'

/**
 * Spanish (neutral Latin American) translation. Keys missing from this
 * file fall back to English at runtime — so a partial translation always
 * renders something, never an empty span.
 *
 * Translator notes:
 * - Address the user as "tú" (not "usted", not "vos"); avoid Spain-only
 *   vocabulary ("ordenador", "vale", "móvil" → "celular"/"teléfono").
 * - "passkey" → "llave de acceso" everywhere (Apple/Google LatAm usage).
 * - "Magic link" → "enlace mágico".
 * - "Email" as a field label → "Correo electrónico"; in running text the
 *   short "correo" is fine.
 * - {count}-style placeholders are interpolated by the i18n provider;
 *   keep the curly braces and the variable name exactly.
 */
export const es: Partial<Dict> = {
  // Common controls
  'common.signIn': 'Iniciar sesión',
  'common.signOut': 'Cerrar sesión',
  'common.signUp': 'Crear cuenta',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.continue': 'Continuar',
  'common.loading': 'Cargando…',
  'common.email': 'Correo electrónico',
  'common.password': 'Contraseña',
  'common.name': 'Nombre',
  'common.account': 'Cuenta',
  'common.admin': 'Administración',

  // Sign-in / sign-up screens
  'auth.welcome.title': 'Inicia sesión en INITE',
  'auth.welcome.subtitle': 'Elige cómo quieres iniciar sesión',
  'auth.method.passkey': 'Llave de acceso',
  'auth.method.passkey.hint': 'Usa Touch ID, Face ID o una llave de seguridad',
  'auth.method.magic': 'Enlace mágico',
  'auth.method.magic.hint': 'Te enviamos un enlace por correo para entrar',
  'auth.method.password': 'Contraseña',
  'auth.method.password.hint': 'Correo y contraseña, como siempre',
  'auth.recommended': 'Recomendado',
  'auth.method.otp': 'Código por correo',
  'auth.method.otp.hint': 'Recibe por correo un código de 6 dígitos de un solo uso',
  'auth.method.wallet': 'Billetera Ethereum',
  'auth.method.wallet.hint': 'Inicia sesión con tu billetera Web3',

  // Sign-in / sign-up landing (method picker)
  'auth.hero.login.subtitle': 'Elige cómo quieres iniciar sesión.',
  'auth.hero.register.title': 'Crea tu cuenta de INITE',
  'auth.hero.register.subtitle':
    'Elige cómo quieres registrarte — después puedes agregar más métodos.',
  'auth.hero.forClient': 'para',
  'auth.stepUp.notice':
    'Esta app requiere un nivel de seguridad más alto. Vuelve a verificar tu identidad con una llave de acceso o un segundo factor para continuar.',
  'auth.stepUp.otherMethod': 'Usar otro método de inicio de sesión',
  'auth.allMethods': 'Todos los métodos',
  'auth.switch.haveAccount': '¿Ya tienes una cuenta?',
  'auth.switch.signIn': 'Inicia sesión',
  'auth.switch.noAccount': '¿No tienes una cuenta?',
  'auth.switch.create': 'Crea una',
  'auth.legal.prefix': 'Al continuar, aceptas los',
  'auth.legal.terms': 'Términos del servicio',
  'auth.legal.and': 'y la',
  'auth.legal.privacy': 'Política de privacidad',

  // Email one-time code
  'auth.otp.title.request': 'Inicia sesión con un código',
  'auth.otp.title.verify': 'Ingresa tu código',
  'auth.otp.subtitle.request': 'Te enviaremos por correo un código de 6 dígitos de un solo uso.',
  'auth.otp.subtitle.verify': 'Enviamos un código de 6 dígitos a {email}.',
  'auth.otp.field.email': 'Correo electrónico',
  'auth.otp.field.code': 'Código de 6 dígitos',
  'auth.otp.cta.send': 'Enviar código',
  'auth.otp.cta.sending': 'Enviando…',
  'auth.otp.cta.verify': 'Verificar e iniciar sesión',
  'auth.otp.cta.verifying': 'Verificando…',
  'auth.otp.useDifferent': 'Usar otro correo',
  'auth.otp.sent': 'Código enviado — revisa tu correo',
  'auth.otp.success': 'Sesión iniciada',
  'auth.otp.error.send': 'No pudimos enviar el código',
  'auth.otp.error.format': 'Ingresa el código de 6 dígitos',
  'auth.otp.error.invalid': 'El código no es válido o ya venció',

  // Social sign-in
  'auth.social.or': 'o continúa con',
  'auth.social.error.emailConflict':
    'Ya existe una cuenta con ese correo. Inicia sesión con el método que ya usas y luego vincula este proveedor desde la configuración de tu cuenta.',
  'auth.social.error.failed': 'No se pudo iniciar sesión con la red social. Inténtalo de nuevo.',

  // OAuth consent screen
  'consent.header': 'Autorizar app',
  'consent.title': 'Confirma el inicio de sesión',
  'consent.wantsAccess': 'quiere acceder a tu cuenta',
  'consent.user': 'Usuario',
  'consent.switchAccount': 'Usar otra cuenta',
  'consent.permissions': 'Esto permitirá que la app:',
  'consent.allow': 'Permitir',
  'consent.allowing': 'Autorizando…',
  'consent.footer':
    'Al hacer clic en Permitir, autorizas a esta app a usar tu información de acuerdo con sus términos.',
  'consent.error.title': 'Error de autorización',
  'consent.privacy': 'Política de privacidad',
  'consent.terms': 'Términos del servicio',
  'consent.scope.openid': 'Verifique tu identidad',
  'consent.scope.profile': 'Acceda a tu nombre y foto de perfil',
  'consent.scope.email': 'Vea tu correo electrónico',
  'consent.scope.admin': 'Tenga acceso de administrador',
  'consent.scope.offline_access': 'Mantenga tu sesión iniciada con tokens de actualización',
  'consent.scope.brain:read': 'Busque y lea tu memoria (brain)',
  'consent.scope.brain:write': 'Guarde datos en tu memoria (brain)',
  'consent.scope.brain:admin': 'Administre tu espacio de memoria (brain)',
  'consent.scope.brain:read_pii': 'Lea los datos personales identificables de tu memoria',

  // Password form
  'auth.password.title.login': 'Inicia sesión con contraseña',
  'auth.password.title.register': 'Crear cuenta',
  'auth.password.subtitle.login': 'Usa tu correo y tu contraseña',
  'auth.password.subtitle.register': 'Regístrate con correo y contraseña',
  'auth.password.cta.login': 'Iniciar sesión',
  'auth.password.cta.register': 'Crear cuenta',
  'auth.password.cta.loading.login': 'Iniciando sesión…',
  'auth.password.cta.loading.register': 'Creando cuenta…',
  'auth.password.switch.toRegister': '¿No tienes una cuenta? Regístrate',
  'auth.password.switch.toLogin': '¿Ya tienes una cuenta? Inicia sesión',
  'auth.password.warning':
    'El acceso con contraseña se mantiene por compatibilidad. Para mayor seguridad, te recomendamos usar una llave de acceso.',
  'auth.password.success.login': '¡Sesión iniciada!',
  'auth.password.success.register': '¡Cuenta creada!',
  'auth.password.error.breached':
    'Esta contraseña aparece en {count} filtraciones de datos conocidas. Elige una que no hayas usado en otro lado.',
  'auth.password.error.generic': 'No se pudo verificar tu identidad',
  'auth.password.error.fillFields': 'Completa todos los campos',

  // Magic link form
  'auth.magic.title': 'Inicia sesión con tu correo',
  'auth.magic.subtitle': 'Te enviaremos un enlace mágico para iniciar sesión',
  'auth.magic.cta.send': 'Enviar enlace mágico',
  'auth.magic.cta.sending': 'Enviando…',
  'auth.magic.sent.title': 'Revisa tu correo',
  'auth.magic.sent.subtitle': 'Enviamos un enlace mágico a',
  'auth.magic.sent.expiry':
    'El enlace vence en 15 minutos. Si no lo ves, revisa la carpeta de spam.',
  'auth.magic.sent.useDifferent': 'Usar otro correo',
  'auth.magic.howItWorks.title': 'Cómo funciona',
  'auth.magic.howItWorks.1': 'Ingresa tu correo electrónico',
  'auth.magic.howItWorks.2': 'Busca el enlace mágico en tu bandeja de entrada',
  'auth.magic.howItWorks.3': 'Haz clic en el enlace y entra al instante',
  'auth.magic.howItWorks.4': '¡Sin contraseña!',
  'auth.magic.error.generic': 'No se pudo enviar el enlace mágico',
  'auth.magic.success': '¡Enlace mágico enviado! Revisa tu correo',

  // Passkey form
  'auth.passkey.title.login': 'Inicia sesión con llave de acceso',
  'auth.passkey.title.register': 'Registrar llave de acceso',
  'auth.passkey.subtitle.login': 'Usa tu huella, tu rostro o una llave de seguridad',
  'auth.passkey.subtitle.register':
    'Crea una llave de acceso para entrar sin contraseña',
  'auth.passkey.cta.authenticate': 'Verificar identidad',
  'auth.passkey.cta.authenticating': 'Verificando…',
  'auth.passkey.cta.register': 'Registrar llave de acceso',
  'auth.passkey.cta.registering': 'Registrando…',
  'auth.passkey.switch.toRegister': '¿No tienes una llave de acceso? Registra una',
  'auth.passkey.switch.toLogin': '¿Ya tienes una llave de acceso? Inicia sesión',
  'auth.passkey.mostSecure': 'La opción más segura',
  'auth.passkey.mostSecureHint':
    'Las llaves de acceso resisten el phishing y no necesitan contraseña.',

  // Validation
  'validation.email.required': 'Ingresa tu correo electrónico',
  'validation.email.invalid': 'Ingresa un correo electrónico válido',
  'validation.email.tooLong': 'El correo es demasiado largo',
  'validation.password.required': 'Ingresa tu contraseña',
  'validation.password.tooShort': 'La contraseña debe tener al menos 8 caracteres',

  // Errors / generic
  'error.network': 'Error de conexión — inténtalo de nuevo',
  'error.rateLimit': 'Demasiados intentos. Espera un momento.',

  ...esAccount,
}
