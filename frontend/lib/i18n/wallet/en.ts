/**
 * INITE wallet strings (English source). Their own file to keep each under
 * the frontend size gate; merged into `en` by ../dictionary.ts.
 */
export const enWallet = {
  'account.initeWallet.title': 'INITE wallet',
  'account.initeWallet.subtitle':
    'Your own USDC on Base. Only your passkey can move it. Your AI agents can pay from it within the limits you approve.',
  'account.initeWallet.unavailable': 'The INITE wallet is not available yet',
  'account.initeWallet.loadFailed': 'Could not load your wallet.',
  'account.initeWallet.empty': 'No wallet yet',
  'account.initeWallet.empty.hint':
    'Create it with a new passkey. The passkey is the only key to the wallet: INITE cannot move your money.',
  'account.initeWallet.create': 'Create wallet',
  'account.initeWallet.created': 'Wallet created',
  'account.initeWallet.cancelled': 'Passkey prompt dismissed',
  'account.initeWallet.balance': 'Balance',
  'account.initeWallet.address': 'Wallet address on Base',
  'account.initeWallet.topUp': 'Top up',
  'account.initeWallet.withdraw': 'Withdraw',
  'account.initeWallet.history': 'Recent activity',
  'account.initeWallet.history.topup': 'Top-up by {rail}',
  'account.initeWallet.history.withdrawal': 'Sent to {to}',
  'account.initeWallet.safety':
    'Keep the wallet passkey synced (iCloud Keychain, Google Password Manager, a password manager). Losing every copy of it means losing access to the wallet.',
  'account.initeWallet.done': 'Done',
  'account.initeWallet.status.pending': 'Waiting',
  'account.initeWallet.status.paid': 'Paid',
  'account.initeWallet.status.completed': 'Delivered',
  'account.initeWallet.status.expired': 'Expired',
  'account.initeWallet.status.failed': 'Failed',
  'account.initeWallet.status.refunded': 'Refunded',
  'account.initeWallet.status.signing': 'Signing',
  'account.initeWallet.status.submitted': 'Sent',
  'account.initeWallet.status.mined': 'Sent',
  'account.initeWallet.status.reverted': 'Refused by the network',
  'account.initeWallet.topUp.title': 'Top up the wallet',
  'account.initeWallet.topUp.transfer': 'Transfer',
  'account.initeWallet.topUp.transfer.hint':
    'Send USDC on the Base network to this address. Other tokens, or USDC on other networks, will be lost.',
  'account.initeWallet.topUp.pix.amount': 'Amount, R$',
  'account.initeWallet.topUp.pix.create': 'Get a PIX code',
  'account.initeWallet.topUp.pix.hint':
    'Pay this PIX from your bank app. Hodle converts the reais and delivers USDC to your wallet, usually within minutes.',
  'account.initeWallet.topUp.pix.code': 'PIX copy-and-paste code',
  'account.initeWallet.topUp.pix.waiting': 'Waiting for the payment…',
  'account.initeWallet.topUp.pix.done': 'USDC is on its way to your wallet.',
  'account.initeWallet.withdraw.title': 'Withdraw USDC',
  'account.initeWallet.withdraw.to': 'Recipient address on Base',
  'account.initeWallet.withdraw.amount': 'Amount, USDC',
  'account.initeWallet.withdraw.hint':
    'You confirm with the wallet passkey. INITE pays the network fee.',
  'account.initeWallet.withdraw.submit': 'Confirm with passkey',
  'account.initeWallet.withdraw.sent': 'Sent.',
  'account.initeWallet.withdraw.pending': 'Sent. Waiting for the network to confirm it.',
  'account.initeWallet.agents.title': 'AI agents',
  'account.initeWallet.agents.status.pending': 'Waiting for you',
  'account.initeWallet.agents.status.active': 'Can pay',
  'account.initeWallet.agents.status.revoked': 'Revoked',
  'account.initeWallet.agents.usage':
    'Today ${today} of ${daily} · this month ${month} of ${monthly} · up to ${each} a payment',
  'account.initeWallet.agents.waiting':
    'Asked to pay from your wallet. Set its limits and approve with the wallet passkey.',
  'account.initeWallet.agents.approve': 'Review',
  'account.initeWallet.agents.revoke': 'Revoke',
  'account.initeWallet.agents.revoke.confirm':
    'The agent can no longer pay from your wallet. Payments it already made stay made.',
  'account.initeWallet.agents.revoked': 'Agent revoked',
  'account.initeWallet.agents.approved': 'Agent approved',
  'account.initeWallet.agents.approveTitle': 'Let {name} pay',
  'account.initeWallet.agents.approveHint':
    'The agent pays by itself on sites that accept x402, up to these limits. You can revoke it at any time.',
  'account.initeWallet.agents.perPayment': 'Up to, per payment ($)',
  'account.initeWallet.agents.daily': 'Up to, per day ($)',
  'account.initeWallet.agents.monthly': 'Up to, per month ($)',
  'account.initeWallet.agents.merchants': 'Only on: {sites}',
  'account.initeWallet.agents.twice':
    'Your browser asks for the wallet passkey twice: to add the agent, then to set its payment limit.',
  'account.initeWallet.agents.confirm': 'Approve with passkey',
};
