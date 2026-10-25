/** Passive tabs cannot overwrite the controls of the last actively used tab. */
export class ControlLease {
  owner = null;
  expiresAt = 0;
  accept(clientId, claim, now = Date.now()) {
    if (clientId !== undefined && (typeof clientId !== 'string' || !/^[a-z0-9-]{8,64}$/i.test(clientId))) throw new Error('Ungültige Bedienungssitzung.');
    if (this.expiresAt <= now) this.owner = null;
    const id = clientId ?? 'legacy';
    if (claim === true || (!this.owner && id === 'legacy')) this.owner = id;
    if (this.owner !== id) return false;
    this.expiresAt = now + 2000;
    return true;
  }
}
