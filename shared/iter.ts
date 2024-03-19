/*
 * Retrive elements from an async generator, until a predicate is met. This
 * is a way of working around `break` stopping a generator
 *
 * @param pred a predicate function
 * @param elems an sync generator
 */
export async function takeWhile<T>(
  pred: (elem: T) => boolean,
  elems: AsyncGenerator<T>,
): Promise<void> {
  const elem = await elems.next();

  return pred(elem.value) ? await takeWhile(pred, elems) : undefined;
}
