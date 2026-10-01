/** Compare required GitHub controls without including API values in findings. */
export function policyMismatches(expected, actual, location = 'policy') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return [location]
    // GitHub can reorder rules and action patterns; every item still needs a
    // unique match, so a duplicated weaker rule cannot hide a missing control.
    const remaining = [...actual]
    for (const item of expected) {
      const index = remaining.findIndex(
        (candidate) => policyMismatches(item, candidate).length === 0,
      )
      if (index === -1) return [location]
      remaining.splice(index, 1)
    }
    return []
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return [location]
    return Object.entries(expected).flatMap(([key, value]) =>
      policyMismatches(value, actual[key], `${location}.${key}`),
    )
  }
  return Object.is(expected, actual) ? [] : [location]
}
