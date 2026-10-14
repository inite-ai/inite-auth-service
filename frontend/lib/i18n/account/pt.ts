import type { Dict } from '../dictionary'

/** Account-area strings, Brazilian Portuguese. Merged into `pt` by ../pt.ts. */
export const ptAccount: Partial<Dict> = {
  // ---------- Account ----------
  'account.title': 'Conta',
  'account.subtitle': 'Gerencie sua identidade, métodos de acesso e dispositivos.',
  'account.nav.profile': 'Perfil',
  'account.nav.security': 'Segurança',
  'account.nav.access': 'Acesso',
  'account.nav.activity': 'Atividade',
  'account.nav.data': 'Seus dados',
  'account.error.title': 'Não foi possível carregar esta seção',
  'account.error.retry': 'Tentar de novo',
  'account.footer': 'INITE Identity Provider · Sua identidade, seu controle',

  // Profile
  'account.profile.title': 'Perfil',
  'account.profile.subtitle': 'Como você aparece no INITE',
  'account.profile.edit': 'Editar',
  'account.profile.anonymous': 'Conta sem nome',
  'account.profile.field.name': 'Nome de exibição',
  'account.profile.field.name.placeholder': 'Seu nome',
  'account.profile.field.bio': 'Bio',
  'account.profile.field.bio.placeholder': 'Uma frase sobre você',
  'account.profile.field.location': 'Localização',
  'account.profile.field.location.placeholder': 'Cidade, país',
  'account.profile.field.profession': 'Profissão',
  'account.profile.field.profession.placeholder': 'O que você faz',
  'account.profile.field.avatar': 'URL da foto de perfil',
  'account.profile.field.avatar.helper':
    'Link para uma imagem quadrada. Deixe em branco para usar sua inicial.',
  'account.profile.saved': 'Perfil atualizado',
  'account.profile.saveFailed': 'Não foi possível atualizar o perfil',
  'account.profile.did': 'Identificador descentralizado',

  // Email
  'account.email.verified': 'Verificado',
  'account.email.unverified': 'Não verificado',
  'account.email.verify': 'Verificar',
  'account.email.change': 'Alterar e-mail',
  'account.email.resend': 'Reenviar verificação',
  'account.email.resent': 'E-mail de verificação enviado',
  'account.email.pending.title': 'Troca de e-mail aguardando confirmação',
  'account.email.pending.body':
    'Enviamos um link de confirmação para {email}. Seu endereço muda assim que você abrir o link.',
  'account.email.pending.cancel': 'Cancelar troca',
  'account.email.pending.cancelled': 'Troca de e-mail cancelada',
  'account.email.sheet.title': 'Alterar endereço de e-mail',
  'account.email.sheet.subtitle':
    'Enviamos um link de confirmação para o novo endereço. Nada muda até você abrir o link.',
  'account.email.sheet.new': 'Novo endereço de e-mail',
  'account.email.sheet.password': 'Confirme com sua senha',
  'account.email.sheet.submit': 'Enviar link de confirmação',
  'account.email.sheet.sent': 'Link de confirmação enviado para o novo endereço',
  'account.email.error.same': 'Esse já é o seu endereço de e-mail',

  // Security overview
  'account.security.title': 'Segurança',
  'account.security.subtitle': 'Como esta conta está protegida',
  'account.security.score': 'Proteção da conta',
  'account.security.score.strong': 'Forte',
  'account.security.score.fair': 'Pode melhorar',
  'account.security.score.weak': 'Precisa de atenção',
  'account.security.todo': 'Próximos passos recomendados',
  'account.security.done.email': 'E-mail verificado',
  'account.security.done.password': 'Senha definida',
  'account.security.done.twoFactor': 'Verificação em duas etapas ativa',
  'account.security.done.passkeys': '{count} chave(s) de acesso',
  'account.security.done.wallets': '{count} carteira(s) vinculada(s)',
  'account.security.todo.email': 'Verifique seu endereço de e-mail',
  'account.security.todo.password': 'Defina uma senha',
  'account.security.todo.twoFactor': 'Ative a verificação em duas etapas',
  'account.security.todo.passkeys': 'Adicione uma chave de acesso',
  'account.security.todo.wallets': 'Vincule uma carteira',

  // Password
  'account.password.title': 'Senha',
  'account.password.set': 'Senha definida',
  'account.password.unset': 'Nenhuma senha definida',
  'account.password.change': 'Alterar',
  'account.password.create': 'Definir senha',
  'account.password.sheet.title': 'Alterar senha',
  'account.password.sheet.subtitle':
    'Ao alterar a senha, você sai de todos os outros dispositivos.',
  'account.password.current': 'Senha atual',
  'account.password.new': 'Nova senha',
  'account.password.confirm': 'Confirme a nova senha',
  'account.password.rule.length': 'Pelo menos 8 caracteres',
  'account.password.rule.uppercase': 'Uma letra maiúscula',
  'account.password.rule.number': 'Um número',
  'account.password.rule.match': 'As duas senhas são iguais',
  'account.password.changed': 'Senha alterada — você saiu dos outros dispositivos',
  'account.password.error.mismatch': 'As senhas não coincidem',
  'account.password.error.rules': 'A nova senha não atende aos requisitos',

  // Two-factor
  'account.twoFactor.title': 'Verificação em duas etapas',
  'account.twoFactor.on': 'App autenticador ativado',
  'account.twoFactor.off': 'Um código do seu celular, além da senha',
  'account.twoFactor.enable': 'Ativar',
  'account.twoFactor.disable': 'Desativar',
  'account.twoFactor.setup.title': 'Configurar verificação em duas etapas',
  'account.twoFactor.setup.step1': 'Escaneie este código com seu app autenticador',
  'account.twoFactor.setup.manual': 'Ou digite esta chave manualmente',
  'account.twoFactor.setup.step2': 'Digite o código de 6 dígitos exibido no app',
  'account.twoFactor.setup.submit': 'Verificar e ativar',
  'account.twoFactor.setup.enabled': 'Verificação em duas etapas ativada',
  'account.twoFactor.disable.title': 'Desativar verificação em duas etapas',
  'account.twoFactor.disable.warning':
    'Sua conta ficará protegida apenas pela senha.',
  'account.twoFactor.disable.submit': 'Desativar',
  'account.twoFactor.disabled': 'Verificação em duas etapas desativada',
  'account.twoFactor.code': 'Código de 6 dígitos',

  // Backup codes
  'account.backupCodes.title': 'Códigos de recuperação',
  'account.backupCodes.remaining': '{count} de 10 não usados',
  'account.backupCodes.low':
    'Restam só {count}. Gere um novo conjunto antes que acabem.',
  'account.backupCodes.none': 'Acabaram os códigos de recuperação — gere um novo conjunto',
  'account.backupCodes.regenerate': 'Gerar novos códigos',
  'account.backupCodes.saved.title': 'Guarde seus códigos de recuperação',
  'account.backupCodes.saved.body':
    'Cada código funciona uma única vez, caso você perca o autenticador. Esta é a única vez que eles aparecem.',
  'account.backupCodes.copy': 'Copiar',
  'account.backupCodes.download': 'Baixar',
  'account.backupCodes.confirm': 'Já guardei',
  'account.backupCodes.copied': 'Códigos de recuperação copiados',
  'account.backupCodes.replaced': 'Novos códigos de recuperação gerados — os antigos não funcionam mais',

  // Passkeys
  'account.passkeys.title': 'Chaves de acesso',
  'account.passkeys.subtitle': 'Entre com sua digital, seu rosto ou uma chave de segurança',
  'account.passkeys.add': 'Adicionar chave de acesso',
  'account.passkeys.empty': 'Nenhuma chave de acesso ainda',
  'account.passkeys.empty.hint':
    'A chave de acesso troca a senha pelo desbloqueio do seu dispositivo — e não pode ser roubada por phishing.',
  'account.passkeys.added': 'Chave de acesso adicionada',
  'account.passkeys.cancelled': 'Criação da chave de acesso cancelada',
  'account.passkeys.remove': 'Remover chave de acesso',
  'account.passkeys.remove.confirm':
    'Você não poderá mais entrar com esta chave de acesso.',
  'account.passkeys.removed': 'Chave de acesso removida',
  'account.passkeys.lastOne':
    'Este é seu único método de acesso sem senha. Se você removê-lo, só restará a senha para entrar.',

  // Wallets
  'account.wallets.title': 'Carteiras vinculadas',
  'account.wallets.subtitle': 'Endereços Web3 que podem entrar nesta conta',
  'account.wallets.addEvm': 'Vincular EVM',
  'account.wallets.addTon': 'Vincular TON',
  'account.wallets.connecting': 'Aguardando sua carteira…',
  'account.wallets.empty': 'Nenhuma carteira vinculada',
  'account.wallets.empty.hint':
    'Vincule um endereço Ethereum, Polygon, BSC ou TON para entrar com sua carteira.',
  'account.wallets.linked': 'Carteira vinculada',
  'account.wallets.cancelled': 'Conexão com a carteira cancelada',
  'account.wallets.proofRefused':
    'Sua carteira não enviou a prova de titularidade. Tente conectar de novo.',
  'account.wallets.unlink': 'Desvincular carteira',
  'account.wallets.unlink.confirm':
    'Este endereço não poderá mais entrar na sua conta.',
  'account.wallets.unlinked': 'Carteira desvinculada',
  'account.wallets.primary': 'Principal',

  // Sessions / connected apps
  'account.apps.title': 'Apps conectados',
  'account.apps.subtitle': 'Aplicativos que você autorizou a usar sua conta INITE. Enquanto continuarem conectados, você não precisa autorizar de novo.',
  'account.apps.empty': 'Nenhum app conectado',
  'account.apps.empty.hint': 'Os apps que você aprovar na tela de consentimento aparecem aqui.',
  'account.apps.granted': 'Aprovado {when}',
  'account.apps.disconnect': 'Desconectar',
  'account.apps.disconnect.confirm': '{name} perde o acesso e você sai da sua conta nele. Na próxima vez, ele vai pedir sua autorização de novo.',
  'account.apps.disconnected': 'App desconectado',
  'account.sessions.title': 'Onde você está conectado',
  'account.sessions.subtitle': 'Apps e dispositivos com sessão ativa',
  'account.sessions.thisDevice': 'Este dispositivo',
  'account.sessions.unknownDevice': 'Dispositivo desconhecido',
  'account.sessions.lastUsed': 'Último uso {when}',
  'account.sessions.created': 'Iniciada {when}',
  'account.sessions.expires': 'Expira {when}',
  'account.sessions.expiringSoon': 'Expira em menos de um dia',
  'account.sessions.revoke': 'Sair',
  'account.sessions.revoke.confirm':
    'Este app precisará entrar de novo para acessar sua conta.',
  'account.sessions.revoked': 'Você saiu dessa sessão',
  'account.sessions.revokeOthers': 'Sair de todos os outros',
  'account.sessions.revokeOthers.confirm':
    'Você sairá de todos os outros apps e dispositivos. Este continua conectado.',
  'account.sessions.revokedOthers': 'Você saiu de todos os outros',
  'account.sessions.empty': 'Nenhuma outra sessão ativa',
  'account.sessions.empty.hint':
    'Os apps em que você entrar com sua conta INITE aparecerão aqui.',
  'account.sessions.scopes': 'Acesso concedido',

  // Activity
  'account.activity.title': 'Atividade recente',
  'account.activity.subtitle': 'Eventos de segurança na sua conta',
  'account.activity.empty': 'Nada registrado ainda',
  'account.activity.empty.hint':
    'Logins, trocas de senha e autorizações de apps aparecem aqui.',
  'account.activity.showAll': 'Mostrar todos ({count})',
  'account.activity.showLess': 'Mostrar menos',
  'account.activity.repeated': '{count}×',
  'account.activity.unknownDevice': 'dispositivo desconhecido',

  // Data / danger zone
  'account.data.title': 'Seus dados',
  'account.data.subtitle': 'Exporte tudo ou encerre a conta de vez',
  'account.data.export.title': 'Exportar seus dados',
  'account.data.export.body': 'Baixe tudo o que guardamos, em JSON',
  'account.data.export.cta': 'Exportar',
  'account.data.export.done': 'Exportação baixada',
  'account.data.delete.title': 'Excluir conta',
  'account.data.delete.body': 'Remove permanentemente esta conta e todos os dados dela',
  'account.data.delete.cta': 'Excluir',
  'account.data.delete.sheet.title': 'Excluir sua conta?',
  'account.data.delete.sheet.warning':
    'Não dá para desfazer. Se quiser manter seus dados, exporte-os antes.',
  'account.data.delete.sheet.list': 'O que será excluído',
  'account.data.delete.item.identity': 'Seu perfil e identificador (DID)',
  'account.data.delete.item.wallets': 'Todas as carteiras vinculadas',
  'account.data.delete.item.passkeys': 'Todas as chaves de acesso',
  'account.data.delete.item.sessions': 'Todas as sessões ativas',
  'account.data.delete.item.credentials': 'Todas as credenciais emitidas',
  'account.data.delete.confirmLabel': 'Digite {word} para confirmar',
  'account.data.delete.submit': 'Excluir permanentemente',
  'account.data.delete.done': 'Conta excluída',

  // Legacy keys kept for the audit section's previous call sites.
  'account.security.activity.title': 'Atividade recente',
  'account.security.activity.subtitle':
    'Últimos 20 eventos de segurança na sua conta',
  'account.security.activity.empty': 'Nenhuma atividade ainda.',
}
