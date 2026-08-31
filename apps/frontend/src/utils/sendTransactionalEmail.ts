import { connect as tlsConnect, type TLSSocket } from 'node:tls'

export type SendTransactionalEmailParams = {
  subject: string
  bodyText: string
  sender: string
  recipients: string[]
  bccRecipients?: string[]
}

export type SmtpConnect = (
  options: { host: string; port: number; servername: string },
  onSecure: () => void,
) => TLSSocket

/** Overall guard so an unresponsive SMTP host can't hang an API route. */
const SMTP_TIMEOUT_MS = Number(process.env.SES_TIMEOUT_MS) || 15_000

/**
 * Reject any address/header value containing CR or LF. Without this, a value
 * that reaches here from user-controlled data could inject extra SMTP
 * commands or message headers.
 */
function assertNoCrlf(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}: line breaks are not allowed`)
  }
  return value
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

function buildMessage(params: SendTransactionalEmailParams): string {
  const { subject, bodyText, sender, recipients, bccRecipients = [] } = params
  const headers = [
    `From: ${assertNoCrlf(sender, 'sender')}`,
    `To: ${recipients.map((r) => assertNoCrlf(r, 'recipient')).join(', ')}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
  ]
  if (bccRecipients.length > 0) {
    headers.push(
      `Bcc: ${bccRecipients
        .map((r) => assertNoCrlf(r, 'recipient'))
        .join(', ')}`,
    )
  }
  return `${headers.join('\r\n')}\r\n\r\n${bodyText}\r\n`
}

function readReply(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', onError)
    }
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/).filter((line) => line.length > 0)
      const last = lines[lines.length - 1]
      // SMTP multiline replies prefix continuation lines with `NNN-`.
      if (last && /^\d{3} /.test(last)) {
        cleanup()
        resolve(buffer)
      }
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    // A silent server would otherwise leave this promise pending forever and
    // hang the calling API route.
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('SMTP timed out waiting for a reply'))
    }, SMTP_TIMEOUT_MS)
    socket.on('data', onData)
    socket.once('error', onError)
  })
}

async function sendCommand(
  socket: TLSSocket,
  command: string,
): Promise<string> {
  socket.write(`${command}\r\n`)
  return readReply(socket)
}

function assertOk(reply: string, expectedPrefix: string, action: string): void {
  if (!reply.startsWith(expectedPrefix)) {
    throw new Error(`SMTP ${action} failed: ${reply.trim()}`)
  }
}

/**
 * Send a plain-text transactional email over SES SMTP (SSL).
 * Mirrors `ai_ta_backend.utils.email.send_transactional_email.send_email`.
 */
export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams,
  smtpConnect: SmtpConnect = tlsConnect,
): Promise<void> {
  const { sender, recipients, bccRecipients = [] } = params
  if (!sender || recipients.length === 0 || !params.bodyText) {
    throw new Error(
      "Missing required parameter: 'sender' and 'to_recipients' and 'body_text' must be provided.",
    )
  }

  const host = requireEnv('SES_HOST')
  const port = Number(process.env.SES_PORT || 465)
  const username = requireEnv('USERNAME_SMTP')
  const password = requireEnv('PASSWORD_SMTP')

  assertNoCrlf(sender, 'sender')
  recipients.forEach((r) => assertNoCrlf(r, 'recipient'))
  bccRecipients.forEach((r) => assertNoCrlf(r, 'recipient'))

  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const tlsSocket = smtpConnect({ host, port, servername: host }, () => {
      clearTimeout(connectTimer)
      resolve(tlsSocket)
    })
    const connectTimer = setTimeout(() => {
      tlsSocket.destroy()
      reject(new Error('SMTP connection timed out'))
    }, SMTP_TIMEOUT_MS)
    tlsSocket.once('error', (error) => {
      clearTimeout(connectTimer)
      reject(error)
    })
  })

  try {
    const greeting = await readReply(socket)
    assertOk(greeting, '220', 'connect')

    const ehlo = await sendCommand(socket, `EHLO ${host}`)
    assertOk(ehlo, '250', 'EHLO')

    const auth = await sendCommand(socket, 'AUTH LOGIN')
    assertOk(auth, '334', 'AUTH LOGIN')

    const userReply = await sendCommand(
      socket,
      Buffer.from(username).toString('base64'),
    )
    assertOk(userReply, '334', 'AUTH username')

    const passReply = await sendCommand(
      socket,
      Buffer.from(password).toString('base64'),
    )
    assertOk(passReply, '235', 'AUTH password')

    const mailFrom = await sendCommand(socket, `MAIL FROM:<${sender}>`)
    assertOk(mailFrom, '250', 'MAIL FROM')

    for (const recipient of [...recipients, ...bccRecipients]) {
      const rcpt = await sendCommand(socket, `RCPT TO:<${recipient}>`)
      assertOk(rcpt, '250', 'RCPT TO')
    }

    const dataReady = await sendCommand(socket, 'DATA')
    assertOk(dataReady, '354', 'DATA')

    const message = buildMessage(params).replace(/^\./gm, '..')
    socket.write(`${message}\r\n.\r\n`)
    const dataDone = await readReply(socket)
    assertOk(dataDone, '250', 'message body')

    await sendCommand(socket, 'QUIT').catch(() => undefined)
  } finally {
    socket.end()
  }
}
