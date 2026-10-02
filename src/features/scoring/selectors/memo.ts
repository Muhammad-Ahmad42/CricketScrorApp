export function memoizeLast<A, R>(fn: (a: A) => R): (a: A) => R {
  let cached: { readonly a: A; readonly r: R } | null = null;
  return (a: A): R => {
    if (cached !== null && Object.is(cached.a, a)) {
      return cached.r;
    }
    const r = fn(a);
    cached = { a, r };
    return r;
  };
}

export function memoizeLast2<A, B, R>(fn: (a: A, b: B) => R): (a: A, b: B) => R {
  let cached: { readonly a: A; readonly b: B; readonly r: R } | null = null;
  return (a: A, b: B): R => {
    if (cached !== null && Object.is(cached.a, a) && Object.is(cached.b, b)) {
      return cached.r;
    }
    const r = fn(a, b);
    cached = { a, b, r };
    return r;
  };
}
