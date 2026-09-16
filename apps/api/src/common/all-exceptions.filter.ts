import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { ApiErrorEnvelope } from '@oks/shared';

/**
 * Единый формат ошибок `{ error: { code, message, details } }` (§11 ТЗ).
 * Обрабатывает HttpException, ошибки Prisma и непредвиденные исключения.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Внутренняя ошибка сервера';
    let details: unknown;

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const resp = exception.getResponse();
      code = httpStatusToCode(httpStatus);
      if (typeof resp === 'string') {
        message = resp;
      } else if (resp && typeof resp === 'object') {
        const r = resp as { message?: string | string[]; error?: string; statusCode?: number };
        message = Array.isArray(r.message) ? r.message.join('; ') : (r.message ?? exception.message);
        code = r.error ? slug(r.error) : code;
        details = Array.isArray(r.message) ? r.message : undefined;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      httpStatus = mapPrismaStatus(exception.code);
      code = `DB_${exception.code}`;
      message = prismaMessage(exception.code);
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // неверно собранный запрос (например, строка вместо массива в `{ in: [...] }`) —
      // это ошибка валидации входных данных, а не сбой сервера: 400 + внятный код
      httpStatus = HttpStatus.BAD_REQUEST;
      code = 'DB_VALIDATION';
      message = 'Некорректные параметры запроса к данным';
      details = exception.message.split('\n').slice(0, 3).join(' ').slice(0, 300);
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    if (httpStatus >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${httpStatus}`, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${httpStatus}: ${message}`);
    }

    const body: ApiErrorEnvelope = { error: { code, message, details } };
    response.status(httpStatus).json(body);
  }
}

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

function mapPrismaStatus(code: string): number {
  switch (code) {
    case 'P2002':
      return HttpStatus.CONFLICT;
    case 'P2025':
      return HttpStatus.NOT_FOUND;
    case 'P2003':
      return HttpStatus.BAD_REQUEST;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

function prismaMessage(code: string): string {
  switch (code) {
    case 'P2002':
      return 'Запись с таким уникальным ключом уже существует';
    case 'P2025':
      return 'Запрошенная запись не найдена';
    case 'P2003':
      return 'Нарушена ссылка на связанную запись';
    default:
      return 'Ошибка базы данных';
  }
}
