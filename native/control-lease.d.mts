export class ControlLease {
  owner: string | null;
  expiresAt: number;
  accept(clientId: string | undefined, claim: boolean, now?: number): boolean;
}
