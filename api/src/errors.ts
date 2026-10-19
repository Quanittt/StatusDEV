export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Некоректний запит") {
    super(400, "BAD_REQUEST", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Потрібна авторизація") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Недостатньо прав") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Не знайдено") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Конфлікт даних") {
    super(409, "CONFLICT", message);
  }
}

export class PlanLimitError extends AppError {
  constructor(message = "Ліміт тарифу вичерпано") {
    super(402, "PLAN_LIMIT", message);
  }
}

export class GoneError extends AppError {
  constructor(message = "Термін дії посилання минув") {
    super(410, "LINK_EXPIRED", message);
  }
}

// Портал із паролем: клієнт має спершу ввести пароль (POST /portal/:token/unlock).
export class PortalPasswordRequiredError extends AppError {
  constructor() {
    super(401, "PORTAL_PASSWORD_REQUIRED", "Потрібен пароль");
  }
}

export class WrongPasswordError extends AppError {
  constructor() {
    super(401, "WRONG_PASSWORD", "Невірний пароль");
  }
}
