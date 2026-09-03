/* The absolute address of a receipt's main photograph. It is minted into the
   VaultReceipt on chain, so a wallet showing the object can render the item
   without knowing anything about this api beyond its origin. */
export function buildReceiptPhotoUrl(publicBaseUrl: string, receiptKey: string): string {
  return `${publicBaseUrl}/api/v1/receipts/${encodeURIComponent(receiptKey)}/photo`;
}
