import configuration from '@/config/configuration.js'

describe('configuration', () => {
  it('returns defaults when no env vars are set', () => {
    const cfg = configuration()
    expect(cfg.port).toBe(3000)
    expect(cfg.region).toBe('US')
    expect(cfg.logFormat).toBe(process.env.LOG_FORMAT ?? 'pretty')
    expect(cfg.redis.host).toBe('localhost')
    expect(cfg.redis.port).toBe(6379)
  })

  it('reads environment overrides', () => {
    process.env.APP_REGION = 'EU'
    process.env.REDIS_PORT = '6380'
    process.env.LOG_FORMAT = 'json'

    const cfg = configuration()
    expect(cfg.region).toBe('EU')
    expect(cfg.redis.port).toBe(6380)
    expect(cfg.logFormat).toBe('json')

    delete process.env.APP_REGION
    delete process.env.REDIS_PORT
    delete process.env.LOG_FORMAT
  })
})
