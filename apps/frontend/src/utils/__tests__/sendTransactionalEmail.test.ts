import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  sendTransactionalEmail,
  type SmtpConnect,
} from '../sendTransactionalEmail'

class FakeSocket extends EventEmitter {
  written: string[] = []
  ended = false
  replies: string[] = []
  private pendingData: Buffer[] = []

  emit(event: string, ...args: any[]) {
    if (event === 'data' && this.listenerCount('data') === 0) {
      this.pendingData.push(args[0])
      return false
    }
    return super.emit(event, ...args)
  }

  on(event: string, listener: (...args: any[]) => void) {
    const result = super.on(event, listener)
    if (event === 'data' && this.pendingData.length > 0) {
      for (const chunk of this.pendingData.splice(0)) {
        super.emit('data', chunk)
      }
    }
    return result
  }

  write(chunk: string) {
    this.written.push(chunk)
    const next = this.replies.shift()
    if (next) queueMicrotask(() => this.emit('data', Buffer.from(next)))
    return true
  }
  end() {
    this.ended = true
  }
  off(event: string, listener: (...args: any[]) => void) {
    this.removeListener(event, listener)
    return this
  }
}

function connectWith(
  socket: FakeSocket,
  greeting = '220 hi\r\n',
): SmtpConnect {
  return ((_opts, cb) => {
    queueMicrotask(cb)
    queueMicrotask(() => socket.emit('data', Buffer.from(greeting)))
    return socket as any
  }) as SmtpConnect
}

describe('sendTransactionalEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const baseMail = {
    subject: 'hello',
    bodyText: 'body',
    sender: 'a@b.c',
    recipients: ['d@e.f'],
  }

  function stubSesEnv() {
    vi.stubEnv('SES_HOST', 'email-smtp.example')
    vi.stubEnv('SES_PORT', '465')
    vi.stubEnv('USERNAME_SMTP', 'user')
    vi.stubEnv('PASSWORD_SMTP', 'pass')
  }

  it('throws when required fields are missing', async () => {
    await expect(
      sendTransactionalEmail({
        subject: 's',
        bodyText: '',
        sender: '',
        recipients: [],
      }),
    ).rejects.toThrow(/sender/)
  })

  it('throws when SES env vars are missing', async () => {
    vi.stubEnv('SES_HOST', '')
    await expect(
      sendTransactionalEmail({
        subject: 's',
        bodyText: 'body',
        sender: 'a@b.c',
        recipients: ['d@e.f'],
      }),
    ).rejects.toThrow(/SES_HOST/)
  })

  it('throws when USERNAME_SMTP or PASSWORD_SMTP is missing', async () => {
    vi.stubEnv('SES_HOST', 'email-smtp.example')
    vi.stubEnv('USERNAME_SMTP', '')
    vi.stubEnv('PASSWORD_SMTP', 'pass')
    await expect(sendTransactionalEmail(baseMail)).rejects.toThrow(
      /USERNAME_SMTP/,
    )

    vi.stubEnv('USERNAME_SMTP', 'user')
    vi.stubEnv('PASSWORD_SMTP', '')
    await expect(sendTransactionalEmail(baseMail)).rejects.toThrow(
      /PASSWORD_SMTP/,
    )
  })

  it('sends a UTF-8 subject over SMTP SSL including BCC recipients', async () => {
    stubSesEnv()
    const socket = new FakeSocket()
    socket.replies = [
      '250-hello\r\n250 AUTH\r\n',
      '334 VXNlcm5hbWU6\r\n',
      '334 UGFzc3dvcmQ6\r\n',
      '235 ok\r\n',
      '250 sender\r\n',
      '250 to\r\n',
      '250 bcc\r\n',
      '354 go\r\n',
      '250 queued\r\n',
      '221 bye\r\n',
    ]

    await sendTransactionalEmail(
      {
        subject: 'café',
        bodyText: 'hello\n.',
        sender: 'from@example.com',
        recipients: ['to@example.com'],
        bccRecipients: ['bcc@example.com'],
      },
      connectWith(socket),
    )

    expect(socket.ended).toBe(true)
    expect(socket.written.some((w) => w.includes('Bcc: bcc@example.com'))).toBe(
      true,
    )
    expect(socket.written.some((w) => w.includes('=?UTF-8?B?'))).toBe(true)
    expect(socket.written.join('')).toContain('..')
  })

  it('sends an ASCII subject without BCC', async () => {
    stubSesEnv()
    const socket = new FakeSocket()
    socket.replies = [
      '250 AUTH\r\n',
      '334 user\r\n',
      '334 pass\r\n',
      '235 ok\r\n',
      '250 sender\r\n',
      '250 to\r\n',
      '354 go\r\n',
      '250 queued\r\n',
      '221 bye\r\n',
    ]
    await sendTransactionalEmail(baseMail, connectWith(socket))
    expect(socket.written.some((w) => w.includes('Subject: hello'))).toBe(
      true,
    )
  })

  it.each([
    [['421 no ehlo\r\n'], /EHLO/],
    [['250 AUTH\r\n', '500 no\r\n'], /AUTH LOGIN/],
    [['250 AUTH\r\n', '334 x\r\n', '500 no\r\n'], /AUTH username/],
    [['250 AUTH\r\n', '334 x\r\n', '334 y\r\n', '500 no\r\n'], /AUTH password/],
    [
      ['250 AUTH\r\n', '334 x\r\n', '334 y\r\n', '235 ok\r\n', '500 no\r\n'],
      /MAIL FROM/,
    ],
    [
      [
        '250 AUTH\r\n',
        '334 x\r\n',
        '334 y\r\n',
        '235 ok\r\n',
        '250 sender\r\n',
        '500 no\r\n',
      ],
      /RCPT TO/,
    ],
    [
      [
        '250 AUTH\r\n',
        '334 x\r\n',
        '334 y\r\n',
        '235 ok\r\n',
        '250 sender\r\n',
        '250 to\r\n',
        '500 no\r\n',
      ],
      /DATA/,
    ],
    [
      [
        '250 AUTH\r\n',
        '334 x\r\n',
        '334 y\r\n',
        '235 ok\r\n',
        '250 sender\r\n',
        '250 to\r\n',
        '354 go\r\n',
        '500 no\r\n',
      ],
      /message body/,
    ],
  ] as Array<[string[], RegExp]>)(
    'throws on SMTP failure %s',
    async (replies, pattern) => {
      stubSesEnv()
      const socket = new FakeSocket()
      socket.replies = replies
      await expect(
        sendTransactionalEmail(baseMail, connectWith(socket)),
      ).rejects.toThrow(pattern)
      expect(socket.ended).toBe(true)
    },
  )

  it('throws when the SMTP greeting is unsuccessful', async () => {
    stubSesEnv()
    const socket = new FakeSocket()
    await expect(
      sendTransactionalEmail(
        baseMail,
        connectWith(socket, '421 nope\r\n'),
      ),
    ).rejects.toThrow(/connect/)
    expect(socket.ended).toBe(true)
  })

  it('propagates socket errors while waiting for a reply', async () => {
    stubSesEnv()
    const socket = new FakeSocket()
    const connect = ((_opts, cb) => {
      queueMicrotask(cb)
      setTimeout(() => socket.emit('error', new Error('read fail')), 0)
      return socket as any
    }) as SmtpConnect
    await expect(sendTransactionalEmail(baseMail, connect)).rejects.toThrow(
      /read fail/,
    )
  })

  it('propagates TLS connection errors', async () => {
    stubSesEnv()
    const connect = (() => {
      const socket = new FakeSocket()
      queueMicrotask(() => socket.emit('error', new Error('tls down')))
      return socket as any
    }) as SmtpConnect
    await expect(sendTransactionalEmail(baseMail, connect)).rejects.toThrow(
      /tls down/,
    )
  })
})
