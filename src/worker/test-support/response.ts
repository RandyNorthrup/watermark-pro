/** Read response fields without hiding a failed request behind a fixture assertion. */
export async function responseStatus(request: Promise<Response>): Promise<number> {
  const response = await request
  return response.status
}

export async function responseJson(request: Promise<Response>): Promise<unknown> {
  const response = await request
  return await response.json()
}
