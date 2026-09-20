/** Validates a request segment and replaces it with the parsed, typed value. */
export const validate = (schema, property = 'body') => (req, _res, next) => { try { req[property] = schema.parse(req[property]); next(); } catch (error) { next(error); } };
