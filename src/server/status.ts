import { createServerFn } from '@tanstack/react-start'

// Reports the storage engine the app is running on.
export const getStatus = createServerFn().handler(async () => {
  const { databaseInfo } = await import('./db')
  return databaseInfo()
})
