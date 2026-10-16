export function quoteCaptureError(error: unknown): string {
  const http = error as {
    status?: number;
    error?: { error?: { message?: string }; message?: string };
  };
  if (http.status === 0)
    return 'Connection lost. Reconnect and check saved details before retrying.';
  if (http.status === 429)
    return 'Too many attempts. Try again in five minutes.';
  if (http.status === 401 || http.status === 404)
    return 'The link or password is invalid, or this quote is unavailable.';
  if (http.status === 413)
    return 'This image is too large. Please try a smaller photo.';
  return (
    http.error?.error?.message ||
    http.error?.message ||
    (error instanceof Error
      ? error.message
      : 'Could not save. Please try again.')
  );
}
