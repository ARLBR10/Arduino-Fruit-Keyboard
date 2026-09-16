export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export function rejectCrossOriginWrite(request: Request) {
  const origin = request.headers.get('origin')
  return origin !== null && origin !== new URL(request.url).origin
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.'
}
