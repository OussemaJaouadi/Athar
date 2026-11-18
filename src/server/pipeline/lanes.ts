// The three lanes every derived value or link falls into. Shared by the pipeline modules that standardise fields,
// resolve startups and people, and classify website answers.

/**
 * How a value was reached:
 * - `rule`: settled by a rule that has one possible reading; nobody needs to look.
 * - `inferred`: Athar's best reading, shown with a qualifier ("possibly", "probably"); an operator may overrule it.
 * - `review`: the evidence does not settle it; it waits for an operator's decision.
 */
export type Lane = 'rule' | 'inferred' | 'review'

/** A value with the lane it landed in, the id of the rule that produced it, and the reason in plain words. */
export type Reading<T> = {
  value: T
  lane: Lane
  /** Short stable id, `<subject>.<rule>`: "name.caps", "website.parked". */
  rule: string
  /** One sentence an operator can read, with the evidence in it. */
  why: string
}

export const reading = <T>(value: T, lane: Lane, rule: string, why: string): Reading<T> => ({ value, lane, rule, why })
