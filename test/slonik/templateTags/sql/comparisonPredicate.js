// @flow

import test from 'ava';
import createSqlTag from '../../../../src/factories/createSqlTag';
import {
  SqlToken,
} from '../../../../src/tokens';

const sql = createSqlTag();

test('creates comparison of two values', (t) => {
  const query = sql`SELECT ${sql.comparisonPredicate(1, '=', 2)}`;

  t.deepEqual(query, {
    sql: 'SELECT $1 = $2',
    type: SqlToken,
    values: [
      1,
      2,
    ],
  });
});

test('creates comparison of a value to a SQL token (left)', (t) => {
  const query = sql`SELECT ${sql.comparisonPredicate(sql.identifier(['foo']), '=', 1)}`;

  t.deepEqual(query, {
    sql: 'SELECT "foo" = $1',
    type: SqlToken,
    values: [
      1,
    ],
  });
});

test('creates comparison of a value to a SQL token (right)', (t) => {
  const query = sql`SELECT ${sql.comparisonPredicate(1, '=', sql.identifier(['foo']))}`;

  t.deepEqual(query, {
    sql: 'SELECT $1 = "foo"',
    type: SqlToken,
    values: [
      1,
    ],
  });
});

test('throws an error if an invalid operator is used', (t) => {
  t.throws(() => {
    // $FlowFixMe
    sql`${sql.comparisonPredicate(1, 'FOO', 2)}`;
  }, 'Invalid operator.');
});

test('the resulting object is immutable', (t) => {
  const token = sql.comparisonPredicate(1, '=', 2);

  t.throws(() => {
    // $FlowFixMe
    token.foo = 'bar';
  });
});
