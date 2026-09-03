export function unwrapContentResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('empty_content_response');
  }
  if (response.ok !== true) {
    throw new Error(response.error || 'content_task_failed');
  }
  return response.result;
}
