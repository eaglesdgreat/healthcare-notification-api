export interface AppConfig {
  port: number
  nodeEnv: string
  region: 'US' | 'EU'
  redis: {
    host: string
    port: number
    password?: string
  }
  database: {
    url: string
  }
}

export default (): AppConfig => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  region: (process.env.APP_REGION as 'US' | 'EU') ?? 'US',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/notification?schema=public',
  },
})
