import type { Dict } from '../dictionary'

/** INITE wallet strings, Portuguese. Merged into `pt` by ../pt.ts. */
export const ptWallet: Partial<Dict> = {
  'account.initeWallet.title': 'Carteira INITE',
  'account.initeWallet.subtitle':
    'Seus próprios USDC na rede Base. Só a sua passkey pode movimentá-los. Seus agentes de IA pagam com ela dentro dos limites que você aprovar.',
  'account.initeWallet.unavailable': 'A carteira INITE ainda não está disponível',
  'account.initeWallet.loadFailed': 'Não foi possível carregar a carteira.',
  'account.initeWallet.empty': 'Nenhuma carteira ainda',
  'account.initeWallet.empty.hint':
    'Ela é criada com uma nova passkey. A passkey é a única chave da carteira: a INITE não pode movimentar o seu dinheiro.',
  'account.initeWallet.create': 'Criar carteira',
  'account.initeWallet.created': 'Carteira criada',
  'account.initeWallet.cancelled': 'Pedido de passkey fechado',
  'account.initeWallet.balance': 'Saldo',
  'account.initeWallet.address': 'Endereço da carteira na Base',
  'account.initeWallet.topUp': 'Adicionar saldo',
  'account.initeWallet.withdraw': 'Sacar',
  'account.initeWallet.history': 'Movimentações recentes',
  'account.initeWallet.history.topup': 'Recarga via {rail}',
  'account.initeWallet.history.withdrawal': 'Enviado para {to}',
  'account.initeWallet.safety':
    'Mantenha a passkey da carteira sincronizada (Chaves do iCloud, Gerenciador de Senhas do Google, um gerenciador de senhas). Perder todas as cópias dela significa perder o acesso à carteira.',
  'account.initeWallet.done': 'Concluído',
  'account.initeWallet.status.pending': 'Aguardando',
  'account.initeWallet.status.paid': 'Pago',
  'account.initeWallet.status.completed': 'Creditado',
  'account.initeWallet.status.expired': 'Expirado',
  'account.initeWallet.status.failed': 'Falhou',
  'account.initeWallet.status.refunded': 'Reembolsado',
  'account.initeWallet.status.signing': 'Assinando',
  'account.initeWallet.status.submitted': 'Enviado',
  'account.initeWallet.status.mined': 'Enviado',
  'account.initeWallet.status.reverted': 'Recusado pela rede',
  'account.initeWallet.topUp.title': 'Adicionar saldo à carteira',
  'account.initeWallet.topUp.transfer': 'Transferência',
  'account.initeWallet.topUp.transfer.hint':
    'Envie USDC na rede Base para este endereço. Outros tokens, ou USDC em outras redes, serão perdidos.',
  'account.initeWallet.topUp.pix.amount': 'Valor, R$',
  'account.initeWallet.topUp.pix.create': 'Gerar código PIX',
  'account.initeWallet.topUp.pix.hint':
    'Pague este PIX no app do seu banco. A Hodle converte os reais e entrega USDC na sua carteira, normalmente em poucos minutos.',
  'account.initeWallet.topUp.pix.code': 'PIX copia e cola',
  'account.initeWallet.topUp.pix.waiting': 'Aguardando o pagamento…',
  'account.initeWallet.topUp.pix.done': 'Os USDC estão a caminho da sua carteira.',
  'account.initeWallet.withdraw.title': 'Sacar USDC',
  'account.initeWallet.withdraw.to': 'Endereço do destinatário na Base',
  'account.initeWallet.withdraw.amount': 'Valor, USDC',
  'account.initeWallet.withdraw.hint':
    'Você confirma com a passkey da carteira. A INITE paga a taxa da rede.',
  'account.initeWallet.withdraw.submit': 'Confirmar com passkey',
  'account.initeWallet.withdraw.sent': 'Enviado.',
  'account.initeWallet.withdraw.pending': 'Enviado. Aguardando a confirmação da rede.',
}
