/** A business-rule refusal with a message meant for the person who tried it. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}
