import { Elysia, t } from 'elysia'
import { createHost, deleteHost, listHosts, updateHost } from './service'

export const hostRoutes = new Elysia({ prefix: '/api/hosts' })
  .get('/', () => listHosts())
  .post('/', async ({ body, set }) => {
    const host = await createHost(body)
    set.status = 201
    return host
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 8 }),
      description: t.String({ minLength: 1 }),
      ipAddress: t.String({ minLength: 1 }),
      mask: t.String({ minLength: 1 }),
      vlanId: t.String({ minLength: 1 }),
    }),
  })
  .patch('/:hostId', ({ params, body }) => updateHost(params.hostId, body), {
    params: t.Object({ hostId: t.String() }),
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 8 }),
      description: t.String({ minLength: 1 }),
      ipAddress: t.String({ minLength: 1 }),
      mask: t.String({ minLength: 1 }),
      vlanId: t.String({ minLength: 1 }),
    }),
  })
  .delete('/:hostId', async ({ params }) => {
    await deleteHost(params.hostId)
    return { success: true }
  }, {
    params: t.Object({ hostId: t.String() }),
  })
