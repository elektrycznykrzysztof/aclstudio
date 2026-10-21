import { staticPlugin } from '@elysia/static'
import { Elysia } from 'elysia'
import { resolve } from 'node:path'
import { prisma } from './db/prisma'
import { administrationRoutes } from './modules/administration/routes'
import { groupRoutes } from './modules/groups/routes'
import { hostRoutes } from './modules/hosts/routes'
import { policyRoutes } from './modules/policies/routes'
import { switchRoutes } from './modules/switches/routes'
import { terminalRoutes } from './modules/switches/terminal-routes'
import { vlanRoutes } from './modules/vlans/routes'
import { AppError } from './shared/app-error'

const webAssetsPath = resolve(import.meta.dir, '../../web/dist')

new Elysia()
  .get('/api/health', () => ({ status: 'ok' }))
  .use(hostRoutes)
  .use(groupRoutes)
  .use(vlanRoutes)
  .use(policyRoutes)
  .use(administrationRoutes)
  .use(switchRoutes)
  .use(terminalRoutes)
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status
      return { error: error.message }
    }
    if (code === 'VALIDATION') {
      set.status = 400
      return { error: 'The request did not match the expected input.' }
    }

    console.error(error)
    set.status = 500
    return { error: 'An unexpected server error occurred.' }
  })
  .use(staticPlugin({ assets: webAssetsPath, prefix: '/', indexHTML: true }))
  .listen(Number(Bun.env.PORT ?? 3000))

console.info(`ACL Manager is listening on port ${Bun.env.PORT ?? 3000}.`)

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
