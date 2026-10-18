import type { Dict } from './dictionary'
import { ptAccount } from './account/pt'
import { ptWallet } from './wallet/pt'

/**
 * Brazilian Portuguese (pt-BR) translation. Keys missing from this file
 * fall back to English at runtime — so a partial translation always
 * renders something, never an empty span.
 *
 * Translator notes:
 * - Address the user as "você"; imperative UI verbs ("Entrar", "Salvar").
 * - "passkey" → "chave de acesso" (the term Apple/Google use in pt-BR UI),
 *   used consistently everywhere.
 * - "Magic link" → "link mágico".
 * - "Email" → "e-mail" (lowercase, hyphenated) except at sentence start.
 * - {count}-style placeholders are interpolated by the i18n provider;
 *   keep the curly braces and the variable name exactly.
 */
export const pt: Partial<Dict> = {
  // Common controls
  'common.signIn': 'Entrar',
  'common.signOut': 'Sair',
  'common.signUp': 'Criar conta',
  'common.cancel': 'Cancelar',
  'common.save': 'Salvar',
  'common.continue': 'Continuar',
  'common.loading': 'Carregando…',
  'common.email': 'E-mail',
  'common.password': 'Senha',
  'common.name': 'Nome',
  'common.account': 'Conta',
  'common.admin': 'Admin',

  // Sign-in / sign-up screens
  'auth.welcome.title': 'Entrar no INITE',
  'auth.welcome.subtitle': 'Escolha como você quer entrar',
  'auth.method.passkey': 'Chave de acesso',
  'auth.method.passkey.hint': 'Use Touch ID, Face ID ou uma chave de segurança',
  'auth.method.magic': 'Link mágico',
  'auth.method.magic.hint': 'Enviamos um link de acesso para o seu e-mail',
  'auth.method.password': 'Senha',
  'auth.method.password.hint': 'O clássico e-mail e senha',
  'auth.recommended': 'Recomendado',
  'auth.method.otp': 'Código por e-mail',
  'auth.method.otp.hint': 'Receba por e-mail um código de 6 dígitos',
  'auth.method.wallet': 'Carteira Ethereum',
  'auth.method.wallet.hint': 'Entre com a sua carteira Web3',

  // Sign-in / sign-up landing (method picker)
  'auth.hero.login.subtitle': 'Escolha como você quer entrar.',
  'auth.hero.register.title': 'Crie sua conta INITE',
  'auth.hero.register.subtitle':
    'Escolha como quer se cadastrar — dá para adicionar outros métodos depois.',
  'auth.hero.forClient': 'para',
  'auth.stepUp.notice':
    'Este app exige um nível de segurança mais alto. Para continuar, confirme sua identidade com uma chave de acesso ou um segundo fator.',
  'auth.stepUp.otherMethod': 'Usar outro método de acesso',
  'auth.account.title': 'Escolha uma conta',
  'auth.account.signedInAs': 'Você está conectado como',
  'auth.account.noEmail': 'uma conta sem e-mail',
  'auth.account.wantedNotice': 'Este app pediu {email}. Troque para essa conta ou continue com a atual.',
  'auth.account.continueAs': 'Continuar como {email}',
  'auth.account.continue': 'Continuar com esta conta',
  'auth.account.useWanted': 'Entrar como {email}',
  'auth.account.useAnother': 'Usar outra conta',
  'auth.allMethods': 'Todos os métodos',
  'auth.switch.haveAccount': 'Já tem uma conta?',
  'auth.switch.signIn': 'Entrar',
  'auth.switch.noAccount': 'Não tem uma conta?',
  'auth.switch.create': 'Criar conta',
  'auth.legal.prefix': 'Ao continuar, você concorda com os',
  'auth.legal.terms': 'Termos de Uso',
  'auth.legal.and': 'e a',
  'auth.legal.privacy': 'Política de Privacidade do INITE',

  // Email one-time code
  'auth.otp.title.request': 'Entrar com um código',
  'auth.otp.title.verify': 'Digite o código',
  'auth.otp.subtitle.request': 'Vamos enviar um código de 6 dígitos para o seu e-mail.',
  'auth.otp.subtitle.verify': 'Enviamos um código de 6 dígitos para {email}.',
  'auth.otp.field.email': 'Endereço de e-mail',
  'auth.otp.field.code': 'Código de 6 dígitos',
  'auth.otp.cta.send': 'Enviar código',
  'auth.otp.cta.sending': 'Enviando…',
  'auth.otp.cta.verify': 'Verificar e entrar',
  'auth.otp.cta.verifying': 'Verificando…',
  'auth.otp.useDifferent': 'Usar outro e-mail',
  'auth.otp.sent': 'Código enviado — confira seu e-mail',
  'auth.otp.success': 'Você entrou',
  'auth.otp.error.send': 'Não foi possível enviar o código',
  'auth.otp.error.format': 'Digite o código de 6 dígitos',
  'auth.otp.error.invalid': 'Código inválido ou expirado',

  // Social sign-in
  'auth.social.or': 'ou continue com',
  'auth.social.error.emailConflict':
    'Já existe uma conta com esse e-mail. Entre pelo método que você já usa e depois vincule este provedor nas configurações da conta.',
  'auth.social.error.failed': 'Não foi possível entrar com a rede social. Tente de novo.',

  // OAuth consent screen
  'consent.header': 'Autorizar app',
  'consent.title': 'Confirmar acesso',
  'consent.wantsAccess': 'quer acessar sua conta',
  'consent.user': 'Usuário',
  'consent.switchAccount': 'Usar outra conta',
  'consent.permissions': 'Isso permitirá que o app:',
  'consent.wallet.title': 'Pagar com sua carteira INITE',
  'consent.wallet.perPayment': 'Até ${amount} por pagamento',
  'consent.wallet.daily': 'Até ${amount} por dia',
  'consent.wallet.monthly': 'Até ${amount} por mês',
  'consent.wallet.merchants': 'Somente em: {sites}',
  'consent.wallet.anywhere': 'Em qualquer site que aceite USDC na Base',
  'consent.wallet.note': 'Os pagamentos são em USDC na Base. Você aprova com sua chave de acesso; pode mudar os limites ou desconectar o app na sua conta INITE ID a qualquer momento.',
  'consent.allow': 'Permitir',
  'consent.allowing': 'Autorizando…',
  'consent.footer':
    'Ao clicar em Permitir, você autoriza este app a usar suas informações de acordo com os termos dele.',
  'consent.error.title': 'Erro de autorização',
  'consent.privacy': 'Política de Privacidade',
  'consent.terms': 'Termos de Uso',
  'consent.scope.openid': 'Confirme sua identidade',
  'consent.scope.profile': 'Acesse seu nome e sua foto',
  'consent.scope.email': 'Veja seu endereço de e-mail',
  'consent.scope.admin': 'Acesso administrativo',
  'consent.scope.offline_access': 'Mantenha você conectado com tokens de atualização',
  'consent.scope.brain:read': 'Pesquise e leia sua memória (brain)',
  'consent.scope.brain:write': 'Registre fatos na sua memória (brain)',
  'consent.scope.brain:admin': 'Administre seu espaço de memória (brain)',
  'consent.scope.brain:read_pii': 'Leia campos da memória com dados pessoais',
  'consent.scope.mikefluff:purchase': 'Inicie compras de livros no mikefluff.com por você (o pagamento você confirma)',
  'consent.scope.mikefluff:booking': 'Agende chamadas com Mike Fluff em seu nome, com seu nome e e-mail',
  'consent.scope.wallet:pay': 'Pagar com a sua carteira INITE dentro dos limites abaixo, aprovado com a sua passkey',
  'consent.scope.other': 'Use a permissão “{scope}”',
  'device.header': 'Autorizar dispositivo',
  'device.title': 'Autorizar um dispositivo ou agente',
  'device.prompt': 'Digite o código mostrado pelo seu dispositivo, linha de comando ou agente de IA.',
  'device.continue': 'Continuar',
  'device.enterCode': 'Digite o código mostrado no seu dispositivo',
  'device.notFound': 'Código não encontrado ou expirado',
  'device.approvalFailed': 'Não foi possível aprovar',
  'device.signIn.title': 'Entre para continuar',
  'device.signIn.body': 'Você precisa entrar para aprovar um dispositivo.',
  'device.wants': 'quer entrar na sua conta',
  'device.permissions': 'Se você aprovar, ele poderá:',
  'device.resource': 'Somente para uso em {resource}',
  'device.deny': 'Recusar',
  'device.approve': 'Aprovar',
  'device.approved.title': 'Dispositivo aprovado',
  'device.approved.body': 'Pode fechar esta aba. O dispositivo vai concluir o acesso em instantes.',
  'device.denied.title': 'Dispositivo recusado',
  'device.denied.body': 'Você recusou este dispositivo. Ele não terá acesso.',

  // Password form
  'auth.password.title.login': 'Entrar com senha',
  'auth.password.title.register': 'Criar conta',
  'auth.password.subtitle.login': 'Use seu e-mail e sua senha',
  'auth.password.subtitle.register': 'Cadastre-se com e-mail e senha',
  'auth.password.cta.login': 'Entrar',
  'auth.password.cta.register': 'Criar conta',
  'auth.password.cta.loading.login': 'Entrando…',
  'auth.password.cta.loading.register': 'Criando conta…',
  'auth.password.switch.toRegister': 'Não tem uma conta? Cadastre-se',
  'auth.password.switch.toLogin': 'Já tem uma conta? Entrar',
  'auth.password.warning':
    'O login com senha existe por compatibilidade. Para mais segurança, recomendamos usar uma chave de acesso.',
  'auth.password.success.login': 'Você entrou!',
  'auth.password.success.register': 'Conta criada!',
  'auth.password.error.breached':
    'Esta senha aparece em {count} vazamentos de dados conhecidos. Escolha uma senha única.',
  'auth.password.error.generic': 'Falha na autenticação',
  'auth.password.error.fillFields': 'Preencha todos os campos',

  // Forgot / reset password
  'auth.password.forgot': 'Esqueceu a senha?',
  'auth.reset.request.title': 'Redefina sua senha',
  'auth.reset.request.subtitle': 'Enviaremos um link para você criar uma nova.',
  'auth.reset.request.cta': 'Enviar link',
  'auth.reset.request.sent': 'Se existir uma conta para {email}, o link está a caminho. Ele expira em 1 hora.',
  'auth.reset.set.title': 'Crie uma nova senha',
  'auth.reset.set.subtitle': 'Escolha uma nova senha para sua conta.',
  'auth.reset.set.password': 'Nova senha',
  'auth.reset.set.confirm': 'Repita a senha',
  'auth.reset.set.mismatch': 'As senhas não coincidem',
  'auth.reset.set.cta': 'Salvar e continuar',
  'auth.reset.set.success': 'Senha atualizada',
  'auth.reset.error.generic': 'Não foi possível redefinir a senha. O link pode ter expirado.',
  'auth.reset.backToLogin': 'Voltar ao login',

  // Magic link form
  'auth.magic.title': 'Entrar com e-mail',
  'auth.magic.subtitle': 'Vamos enviar um link mágico para você entrar',
  'auth.magic.cta.send': 'Enviar link mágico',
  'auth.magic.cta.sending': 'Enviando…',
  'auth.magic.sent.title': 'Confira seu e-mail',
  'auth.magic.sent.subtitle': 'Enviamos um link mágico para',
  'auth.magic.sent.expiry':
    'O link expira em 15 minutos. Não esqueça de olhar a pasta de spam.',
  'auth.magic.sent.useDifferent': 'Usar outro e-mail',
  'auth.magic.howItWorks.title': 'Como funciona',
  'auth.magic.howItWorks.1': 'Digite seu endereço de e-mail',
  'auth.magic.howItWorks.2': 'Procure o link mágico na sua caixa de entrada',
  'auth.magic.howItWorks.3': 'Clique no link para entrar na hora',
  'auth.magic.howItWorks.4': 'Sem precisar de senha!',
  'auth.magic.error.generic': 'Não foi possível enviar o link mágico',
  'auth.magic.success': 'Link mágico enviado! Confira seu e-mail',

  // Passkey form
  'auth.passkey.title.login': 'Entrar com chave de acesso',
  'auth.passkey.title.register': 'Criar chave de acesso',
  'auth.passkey.subtitle.login': 'Use sua digital, seu rosto ou uma chave de segurança',
  'auth.passkey.subtitle.register':
    'Crie uma chave de acesso para entrar sem senha',
  'auth.passkey.cta.authenticate': 'Autenticar',
  'auth.passkey.cta.authenticating': 'Autenticando…',
  'auth.passkey.cta.register': 'Criar chave de acesso',
  'auth.passkey.cta.registering': 'Criando…',
  'auth.passkey.switch.toRegister': 'Não tem uma chave de acesso? Crie uma',
  'auth.passkey.switch.toLogin': 'Já tem uma chave de acesso? Entrar',
  'auth.passkey.mostSecure': 'Opção mais segura',
  'auth.passkey.mostSecureHint':
    'Chaves de acesso resistem a phishing e dispensam senha.',

  // Validation
  'validation.email.required': 'Informe o e-mail',
  'validation.email.invalid': 'Digite um e-mail válido',
  'validation.email.tooLong': 'E-mail longo demais',
  'validation.password.required': 'Informe a senha',
  'validation.password.tooShort': 'A senha precisa ter pelo menos 8 caracteres',

  // Errors / generic
  'error.network': 'Erro de conexão — tente de novo',
  'error.rateLimit': 'Muitas tentativas. Aguarde um pouco.',

  ...ptAccount,
  ...ptWallet,
}
