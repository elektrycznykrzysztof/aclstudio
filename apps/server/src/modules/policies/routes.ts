import { Elysia, t } from 'elysia'
import { createPolicy, deletePolicy, generateAndDeliverPolicy, listPolicies, updatePolicy } from './service'

const entitySelection = t.Union([
  t.Object({ type: t.Literal('HOST'), id: t.String({ minLength: 1 }) }),
  t.Object({ type: t.Literal('GROUP'), id: t.String({ minLength: 1 }) }),
  t.Object({ type: t.Literal('VLAN'), id: t.String({ minLength: 1 }) }),
])

const policyBody = t.Object({
  description: t.String({ minLength: 1 }),
  vlanId: t.String({ minLength: 1 }),
  internetAccess: t.Optional(t.Boolean()),
  entries: t.Array(t.Object({
    source: entitySelection,
    destination: entitySelection,
    protocol: t.Optional(t.String()),
    destinationPort: t.Optional(t.String()),
    description: t.Optional(t.String({ maxLength: 200 })),
  })),
})

export const policyRoutes = new Elysia({ prefix: '/api/policies' })
  .get('/', () => listPolicies())
  .post('/', async ({ body, set }) => {
    const policy = await createPolicy(body)
    set.status = 201
    return policy
  }, { body: policyBody })
  .patch('/:policyId', ({ params, body }) => updatePolicy(params.policyId, body), {
    params: t.Object({ policyId: t.String() }),
    body: policyBody,
  })
  .delete('/:policyId', async ({ params }) => {
    await deletePolicy(params.policyId)
    return { success: true }
  }, {
    params: t.Object({ policyId: t.String() }),
  })
  .post('/:policyId/generate', ({ params, body }) => {
    return generateAndDeliverPolicy(params.policyId, body.switchId)
  }, {
    params: t.Object({ policyId: t.String() }),
    body: t.Object({ switchId: t.String({ minLength: 1 }) }),
  })
