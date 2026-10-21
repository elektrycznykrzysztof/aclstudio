import { createHash } from 'node:crypto'

export function createHostKeyVerifier(hostKeySha256?: string) {
  const expectedFingerprint = hostKeySha256?.replace(/^SHA256:/, '')
  if (!expectedFingerprint) return undefined

  return (hostKey: Buffer) =>
    createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '') === expectedFingerprint
}
