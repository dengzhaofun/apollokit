/**
 * Task filter expression — thin wrapper around filtrex that centralises the
 * compile options used across the module.
 *
 * We use the strict `useDotAccessOperator` (NOT the optional-chaining
 * variant): authors can reference nested fields with JS-style dot notation
 * (`stats.level`), and missing fields throw `UnknownPropertyError`. The
 * throw is caught at the call site (`matchesFilter` in service.ts) and
 * treated as "filter did not match" — i.e. missing data fails closed.
 *
 * The optional-chaining helper resolves missing fields to `undefined`, and
 * filtrex's numeric comparison of `undefined` produces unexpectedly truthy
 * results (e.g. `missing >= 10` matches on `{}`). Strict + caught throws
 * gives us the safer, more intuitive semantics.
 *
 * Filtrex 3 returns `1` / `0` for booleans; any non-zero result counts as
 * truthy and passes the filter.
 */

import { compileExpression, useDotAccessOperator } from "filtrex";

export type TaskFilterFn = (data: Record<string, unknown>) => unknown;

export const FILTER_MAX_LENGTH = 1024;

export function compileTaskFilter(expression: string): TaskFilterFn {
  return compileExpression(expression, {
    customProp: useDotAccessOperator,
  }) as TaskFilterFn;
}
