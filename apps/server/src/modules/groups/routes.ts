import { Elysia, t } from 'elysia'
import { createGroup, deleteGroup, listGroups, updateGroup } from './service'

export const groupRoutes = new Elysia({ prefix: '/api/groups' })
  .get('/', () => listGroups())
  .post('/', async ({ body, set }) => {
    const group = await createGroup(body)
    set.status = 201
    return group
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      hostIds: t.Array(t.String()),
      vlanId: t.String({ minLength: 1 }),
    }),
  })
  .patch('/:groupId', ({ params, body }) => updateGroup(params.groupId, body), {
    params: t.Object({ groupId: t.String() }),
    body: t.Object({ name: t.String({ minLength: 1 }), hostIds: t.Array(t.String()), vlanId: t.String({ minLength: 1 }) }),
  })
  .delete('/:groupId', async ({ params }) => {
    await deleteGroup(params.groupId)
    return { success: true }
  }, {
    params: t.Object({ groupId: t.String() }),
  })
