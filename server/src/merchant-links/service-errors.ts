export class MerchantLinkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantLinkValidationError";
  }
}
