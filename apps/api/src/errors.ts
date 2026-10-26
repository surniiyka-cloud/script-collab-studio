export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function required<T>(value: T | null | undefined, code = 'NOT_FOUND'): T {
  if (!value) throw new HttpError(404, code, 'Resource not found');
  return value;
}
