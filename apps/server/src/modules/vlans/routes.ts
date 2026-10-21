import { Elysia, t } from 'elysia'
import { createVlan, deleteVlan, listVlans, updateVlan } from './service'

const vlanBody = t.Object({
  name: t.String({ minLength: 1 }),
  tag: t.Number(),
  ipAddress: t.Optional(t.String()),
  mask: t.Optional(t.String()),
  description: t.Optional(t.String()),
})

export const vlanRoutes = new Elysia({ prefix: '/api/vlans' })
  .get('/', () => listVlans())
  .post('/', async ({ body, set }) => {
    const vlan = await createVlan(body)
    set.status = 201
    return vlan
  }, { body: vlanBody })
  .patch('/:vlanId', ({ params, body }) => updateVlan(params.vlanId, body), {
    params: t.Object({ vlanId: t.String() }),
    body: vlanBody,
  })
  .delete('/:vlanId', async ({ params }) => {
    await deleteVlan(params.vlanId)
    return { success: true }
  }, {
    params: t.Object({ vlanId: t.String() }),
  })
