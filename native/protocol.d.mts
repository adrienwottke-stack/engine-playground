export const COMMAND_LIMITS: Record<string, [number, number]>;
export function validateCommand(raw: unknown): Record<string, number | boolean>;
export function commandLine(command: unknown, sequence: number, timestampMs: number, resetId: number): string;
export function validateTelemetry(raw: unknown, now?: number): Record<string, any>;
