import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from '@/app.module.js'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter.js'
import { RequestValidationException } from '@/common/exceptions/notification.exceptions.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.use(helmet())
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new RequestValidationException(
          errors.flatMap((error) => Object.values(error.constraints ?? {})),
        ),
    }),
  )
  app.enableShutdownHooks()

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Healthcare Notification API')
    .setDescription(
      'Multi-region, HIPAA + GDPR aware notification service (email, SMS, push).',
    )
    .setVersion('1.0')
    .addTag('notifications', 'Send notifications and query delivery status')
    .addTag('health', 'Liveness and readiness probes')
    .addApiKey(
      { type: 'apiKey', name: 'Idempotency-Key', in: 'header' },
      'idempotency-key',
    )
    .build()
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, swaggerDocument)

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  Logger.log(`Notification API listening on :${port}`, 'Bootstrap')
  Logger.log(`Swagger docs available at :${port}/api/docs`, 'Bootstrap')
}

void bootstrap()
