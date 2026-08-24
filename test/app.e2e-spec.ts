import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import type { Server } from 'node:http'
import request from 'supertest'
import { AppModule } from './../src/app.module.js'

describe('Notification API (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('/api/health/live (GET) returns 200', () => {
    const server = app.getHttpServer() as Server
    return request(server).get('/api/health/live').expect(200)
  })
})
