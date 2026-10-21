import { Elysia } from 'elysia'
import { getPublicSwitches } from './config'

export const switchRoutes = new Elysia({ prefix: '/api/switches' })
  .get('/', () => getPublicSwitches())
