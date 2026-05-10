
/*
 * Happy path result type
 */
export type Ok<Value> = { ok: true; value: Value };

/*
 * Error result type
 */
export type Err<Failure> = { ok: false; error: Failure };

/*
 * Result type union
 */
export type Result<Value, Failure> = Ok<Value> | Err<Failure>;

/*
 * Constructors for creating Ok
 */
export function ok<Value>(value: Value): Ok<Value> {
  return { ok: true, value };
}

/*
 * Constructor for creating Err
 */
export function err<Failure>(error: Failure): Err<Failure> {
  return { ok: false, error };
}
