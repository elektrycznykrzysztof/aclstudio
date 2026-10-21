import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { Client } from 'ssh2'
import type { SwitchConfig } from './config'
import { createHostKeyVerifier } from './ssh-security'

export async function uploadPolicyFile(
  switchConfig: SwitchConfig,
  fileName: string,
  content: string,
): Promise<void> {
  const localPath = join(tmpdir(), `acl-${randomUUID()}.pol`)
  const remotePath = posix.join(switchConfig.remoteDirectory, fileName)
  await Bun.write(localPath, content)

  try {
    await uploadFileOverSftp(switchConfig, localPath, remotePath)
  } finally {
    await unlink(localPath).catch(() => undefined)
  }
}

function uploadFileOverSftp(switchConfig: SwitchConfig, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      client.end()
      reject(error)
    }

    client.once('error', fail)
    client.once('ready', () => {
      client.sftp((sftpError, sftp) => {
        if (sftpError || !sftp) return fail(sftpError ?? new Error('Unable to open an SFTP session.'))
        sftp.fastPut(localPath, remotePath, (uploadError) => {
          if (uploadError) return fail(uploadError)
          settled = true
          client.end()
          resolve()
        })
      })
    })

    client.connect({
      host: switchConfig.host,
      port: switchConfig.port,
      username: switchConfig.username,
      password: switchConfig.password,
      readyTimeout: 15000,
      hostVerifier: createHostKeyVerifier(switchConfig.hostKeySha256),
    })
  })
}
