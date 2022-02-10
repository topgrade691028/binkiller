import { NestFactory } from '@nestjs/core';
// import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppEnvironment } from './app.environment';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const appEnvironment = app.get(AppEnvironment);
  const port = process.env.PORT || appEnvironment.port;
  await app.listen(port);
}
bootstrap();
