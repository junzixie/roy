export const EXIT_OK = 0
export const EXIT_ERROR = 1
export const EXIT_USAGE = 2

export function info(msg: string): void {
  process.stderr.write(msg + '\n')
}

export function errorLine(msg: string): void {
  process.stderr.write(`error: ${msg}\n`)
}

export function emitJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function emitText(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n')
}

export class UsageError extends Error {}
