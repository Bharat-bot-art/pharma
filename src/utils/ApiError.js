class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  static badRequest(code, msg, extra) {
    return new ApiError(400, code, msg, extra);
  }
  static unauthorized(code, msg, extra) {
    return new ApiError(401, code, msg, extra);
  }
  static forbidden(code, msg, extra) {
    return new ApiError(403, code, msg, extra);
  }
  static notFound(code, msg, extra) {
    return new ApiError(404, code, msg, extra);
  }
  static conflict(code, msg, extra) {
    return new ApiError(409, code, msg, extra);
  }
  static tooMany(code, msg, extra) {
    return new ApiError(429, code, msg, extra);
  }
  static internal(code, msg, extra) {
    return new ApiError(500, code, msg, extra);
  }
}

module.exports = { ApiError };
