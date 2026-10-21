import { Elysia, t } from 'elysia'
import { createDatabaseBackup, restoreDatabaseBackup } from './service'

export const administrationRoutes = new Elysia({ prefix: '/api/administration' })
  .get('/export', async () => {
    const backup = await createDatabaseBackup()
    const date = new Date().toISOString().slice(0, 10)
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="acl-manager-backup-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  })
  .post('/import', ({ body }) => restoreDatabaseBackup(body), {
    body: t.Unknown(),
  })
