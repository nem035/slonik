## Query building

Queries are built using methods of the `sql` tagged template literal.

If this is your first time using Slonik, read [Dynamically generating SQL queries using Node.js](https://dev.to/gajus/dynamically-generating-sql-queries-using-node-js-2c1g).

### `sql.array`

```js
(
  values: $ReadOnlyArray<PrimitiveValueExpressionType>,
  memberType: TypeNameIdentifierType | RawSqlTokenType
) => ArraySqlTokenType;

```

Creates an array value binding, e.g.

```js
await connection.query(sql`
  SELECT (${sql.array([1, 2, 3], 'int4')})
`);

```

Produces:

```js
{
  sql: 'SELECT $1::"int4"[]',
  values: [
    [
      1,
      2,
      3
    ]
  ]
}

```

#### `sql.array` `memberType`

If `memberType` is a string (`TypeNameIdentifierType`), then it is treated as a type name identifier and will be quoted using double quotes, i.e. `sql.array([1, 2, 3], 'int4')` is equivalent to `$1::"int4"[]`. The implication is that keywrods that are often used interchangeably with type names are not going to work, e.g. [`int4`](https://github.com/postgres/postgres/blob/69edf4f8802247209e77f69e089799b3d83c13a4/src/include/catalog/pg_type.dat#L74-L78) is a type name identifier and will work. However, [`int`](https://github.com/postgres/postgres/blob/69edf4f8802247209e77f69e089799b3d83c13a4/src/include/parser/kwlist.h#L213) is a keyword and will not work. You can either use type name identifiers or you can construct custom member using `sql.raw`, e.g.

```js
await connection.query(sql`
  SELECT (${sql.array([1, 2, 3], sql`int[]`)})
`);

```

Produces:

```js
{
  sql: 'SELECT $1::int[]',
  values: [
    [
      1,
      2,
      3
    ]
  ]
}

```

#### `sql.array` vs `sql.valueList`

Unlike `sql.valueList`, `sql.array` generates a stable query of a predictable length, i.e. regardless of the number of the values in the array, the generated query remains the same:

* Having a stable query enables [`pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html) to aggregate all query execution statistics.
* Keeping the query length short reduces query parsing time.

Furthermore, unlike `sql.valueList`, `sql.array` can be used with an empty array of values.

Example:

```js
sql`SELECT id FROM foo WHERE id IN (${sql.valueList([1, 2, 3])})`;
sql`SELECT id FROM foo WHERE id NOT IN (${sql.valueList([1, 2, 3])})`;

```

Is equivalent to:

```js
sql`SELECT id FROM foo WHERE id = ANY(${sql.array([1, 2, 3], 'int4')})`;
sql`SELECT id FROM foo WHERE id != ALL(${sql.array([1, 2, 3], 'int4')})`;

```

In short, when the value list length is dynamic then `sql.array` should be preferred over `sql.valueList`.

### `sql.assignmentList`

```js
(
  namedAssignmentValueBindings: NamedAssignmentType
) => AssignmentListSqlTokenType

```

Creates an assignment list, e.g.

```js
await connection.query(sql`
  UPDATE foo
  SET ${sql.assignmentList({
    bar: 'baz',
    qux: 'quux'
  })}
`);

```

Produces:

```js
{
  sql: 'UPDATE foo SET bar = $1, qux = $2',
  values: [
    'baz',
    'quux'
  ]
}

```

Assignment list can describe other SQL tokens, e.g.

```js
await connection.query(sql`
  UPDATE foo
  SET ${sql.assignmentList({
    bar: sql`to_timestamp(${'baz'})`,
    qux: sql`to_timestamp(${'quux'})`
  })}
`);

```

Produces:

```js
{
  sql: 'UPDATE foo SET bar = to_timestamp($1), qux = to_timestamp($2)',
  values: [
    'baz',
    'quux'
  ]
}

```

#### Snake-case normalization

By default, `sql.assignmentList` converts object keys to snake-case, e.g.

```js
await connection.query(sql`
  UPDATE foo
  SET ${sql.assignmentList({
    barBaz: sql`to_timestamp(${'qux'})`,
    quuxQuuz: sql`to_timestamp(${'corge'})`
  })}
`);

```

Produces:

```js
{
  sql: 'UPDATE foo SET bar_baz = to_timestamp($1), quux_quuz = to_timestamp($2)',
  values: [
    'qux',
    'corge'
  ]
}

```

This behaviour can be overriden by [constructing a custom `sql` tag](#sql-tag) and configuring `normalizeIdentifier`, e.g.

```js
import {
  createSqlTag
} from 'slonik';

const sql = createSqlTag({
  normalizeIdentifier: (identifierName) => {
    return identifierName;
  }
});

```

With this configuration, the earlier code example produces:

```js
{
  sql: 'UPDATE foo SET "barBaz" = to_timestamp($1), "quuxQuuz" = to_timestamp($2)',
  values: [
    'qux',
    'corge'
  ]
}

```

### `sql.binary`

```js
(
  data: Buffer
) => BinarySqlTokenType;

```

Binds binary ([`bytea`](https://www.postgresql.org/docs/current/datatype-binary.html)) data, e.g.

```js
await connection.query(sql`
  SELECT ${sql.binary(Buffer.from('foo'))}
`);

```

Produces:

```js
{
  sql: 'SELECT $1',
  values: [
    Buffer.from('foo')
  ]
}

```

### `sql.booleanExpression`

```js
(
  members: $ReadOnlyArray<ValueExpressionType>,
  operator: LogicalBooleanOperatorType
) => BooleanExpressionSqlTokenType;

```

Boolean expression.

```js
sql`
  SELECT ${sql.booleanExpression([3, 4], 'AND')}
`;

```

Produces:

```js
{
  sql: 'SELECT $1 AND $2',
  values: [
    3,
    4
  ]
}

```

Boolean expressions can describe SQL tokens (including other boolean expressions), e.g.

```js
sql`
  SELECT ${sql.booleanExpression([
    sql.comparisonPredicate(
      sql.identifier(['foo']),
      '=',
      sql`to_timestamp(${2})`
    ),
    sql.booleanExpression([
      3,
      4
    ], 'OR')
  ], 'AND')}
`;

```

Produces:

```js
{
  sql: 'SELECT ("foo" = to_timestamp($1) AND ($1 OR $2))',
  values: [
    2,
    3,
    4
  ]
}

```

Note: Do not use `sql.booleanExpression` when expression consists of a single predicate. Use `sql.comparisonPredicate`.

### `sql.comparisonPredicate`

```js
(
  leftOperand: ValueExpressionType,
  operator: ComparisonOperatorType,
  rightOperand: ValueExpressionType
) => ComparisonPredicateSqlTokenType;

```

A comparison predicate compares two expressions using a comparison operator.

```js
sql`
  SELECT ${sql.comparisonPredicate(3, '=', 4)}
`;

```

Produces:

```js
{
  sql: 'SELECT $1 = $2',
  values: [
    3,
    4
  ]
}

```

Comparison predicate operands can describe SQL tokens, e.g.

```js
sql`
  SELECT ${sql.comparisonPredicate(sql.identifier(['foo']), '=', sql`to_timestamp(${2})`)}
`;

```

Produces:

```js
{
  sql: 'SELECT "foo" = to_timestamp($1)',
  values: [
    2
  ]
}

```

### `sql.identifier`

```js
(
  names: $ReadOnlyArray<string>
) => IdentifierSqlTokenType;

```

[Delimited identifiers](https://www.postgresql.org/docs/current/static/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS) are created by enclosing an arbitrary sequence of characters in double-quotes ("). To create create a delimited identifier, create an `sql` tag function placeholder value using `sql.identifier`, e.g.

```js
sql`
  SELECT 1
  FROM ${sql.identifier(['bar', 'baz'])}
`;

```

Produces:

```js
{
  sql: 'SELECT 1 FROM "bar"."bar"',
  values: []
}

```

### `sql.identifierList`

```js
(
  identifiers: $ReadOnlyArray<$ReadOnlyArray<string>>
) => IdentifierListSqlTokenType;

```

Creates a list of identifiers, e.g.

```js
sql`
  SELECT 1
  FROM ${sql.identifierList([
    ['bar', 'baz'],
    ['qux', 'quux']
  ])}
`;

```

Produces:

```js
{
  sql: 'SELECT 1 FROM "bar"."baz", "qux"."quux"',
  values: []
}

```

#### Identifier aliases

A member of the identifier list can be aliased:

```js
sql`
  SELECT 1
  FROM ${sql.identifierList([
    {
      alias: 'qux',
      identifier: ['bar', 'baz']
    },
    {
      alias: 'corge',
      identifier: ['quux', 'quuz']
    }
  ])}
`;

```

Produces:

```js
{
  sql: 'SELECT 1 FROM "bar"."baz" "qux", "quux"."quuz" "corge"',
  values: []
}

```

### `sql.json`

```js
(
  value: SerializableValueType
) => JsonSqlTokenType;

```

Serializes value and binds it as a JSON string literal, e.g.

```js
await connection.query(sql`
  SELECT (${sql.json([1, 2, 3])})
`);

```

Produces:

```js
{
  sql: 'SELECT $1',
  values: [
    '[1,2,3]'
  ]
}

```

#### Difference from `JSON.stringify`

|Input|`sql.json`|`JSON.stringify`|
|---|---|---|
|`undefined`|Throws `InvalidInputError` error.|`undefined`|
|`null`|`null`|`"null"` (string literal)|

### `sql.raw`

```js
(
  rawSql: string,
  values?: $ReadOnlyArray<PrimitiveValueExpressionType>
) => RawSqlTokenType;

```

Danger! Read carefully: There are no known use cases for generating queries using `sql.raw` that aren't covered by nesting bound `sql` expressions or by one of the other existing [query building methods](#slonik-query-building). `sql.raw` exists as a mechanism to execute externally stored _static_ (e.g. queries stored in files).

Raw/ dynamic SQL can be inlined using `sql.raw`, e.g.

```js
sql`
  SELECT 1
  FROM ${sql.raw('"bar"')}
`;

```

Produces:

```js
{
  sql: 'SELECT 1 FROM "bar"',
  values: []
}

```

The second parameter of the `sql.raw` can be used to bind [positional parameter](https://www.postgresql.org/docs/current/sql-expressions.html#SQL-EXPRESSIONS-PARAMETERS-POSITIONAL) values, e.g.

```js
sql`
  SELECT ${sql.raw('$1', [1])}
`;

```

Produces:

```js
{
  sql: 'SELECT $1',
  values: [
    1
  ]
}

```

#### Named parameters

`sql.raw` supports named parameters, e.g.

```js
sql`
  SELECT ${sql.raw(':foo, :bar', {bar: 'BAR', foo: 'FOO'})}
`;

```

Produces:

```js
{
  sql: 'SELECT $1, $2',
  values: [
    'FOO',
    'BAR'
  ]
}

```

Named parameters are matched using `/[\s,(]:([a-z_]+)/g` regex.

### `sql.rawList`

```js
(
  tokens?: $ReadOnlyArray<RawSqlTokenType>
) => RawListSqlTokenType;

```

Produces a comma-separated list of `sql.raw` expressions, e.g.

```js
sql`SELECT 1 FROM ${sql.rawList([
  sql.raw('$1, $2', ['foo', 'bar']),
  sql.raw('$1, $2', ['baz', 'qux']),
])}`

```

Produces:

```js
{
  sql: 'SELECT 1 FROM $1, $2, $3, $4',
  values: [
    'foo',
    'bar',
    'baz',
    'qux'
  ]
}

```

Use `sql.rawList` with `sql.raw` and `sql.valueList` to create a list of function invocations, e.g.

```js
sql`
  SELECT ARRAY[
    ${sql.rawList([
      sql.raw('ST_GeogFromText($1)', [sql.valueList(['SRID=4267;POINT(-77.0092 38.889588)'])]),
      sql.raw('ST_GeogFromText($1)', [sql.valueList(['SRID=4267;POINT(-77.0092 38.889588)'])]),
    ])}
  ]::geography[]
`

```

Produces:

```js
{
  sql: 'SELECT ARRAY[ST_GeogFromText($1), ST_GeogFromText($2)]::geography[]',
  values: [
    'SRID=4267;POINT(-77.0092 38.889588)',
    'SRID=4267;POINT(-77.0092 38.889588)'
  ]
}

```

### `sql.tuple`

```js
(
  values: $ReadOnlyArray<PrimitiveValueExpressionType>
) => TupleSqlTokenType;

```

Creates a tuple (typed row construct), e.g.

```js
await connection.query(sql`
  INSERT INTO (foo, bar, baz)
  VALUES ${sql.tuple([1, 2, 3])}
`);

```

Produces:

```js
{
  sql: 'INSERT INTO (foo, bar, baz) VALUES ($1, $2, $3)',
  values: [
    1,
    2,
    3
  ]
}

```

Tuple can describe other SQL tokens, e.g.

```js
await connection.query(sql`
  INSERT INTO (foo, bar, baz)
  VALUES ${sql.tuple([1, sql`to_timestamp(${2})`, 3])}
`);

```

Produces:

```js
{
  sql: 'INSERT INTO (foo, bar, baz) VALUES ($1, to_timestamp($2), $3)',
  values: [
    1,
    2,
    3
  ]
}

```

### `sql.tupleList`

```js
(
  tuples: $ReadOnlyArray<$ReadOnlyArray<PrimitiveValueExpressionType>>
) => TupleListSqlTokenType;

```

Creates a list of tuples (typed row constructs), e.g.

```js
await connection.query(sql`
  INSERT INTO (foo, bar, baz)
  VALUES ${sql.tupleList([
    [1, 2, 3],
    [4, 5, 6]
  ])}
`);

```

Produces:

```js
{
  sql: 'INSERT INTO (foo, bar, baz) VALUES ($1, $2, $3), ($4, $5, $6)',
  values: [
    1,
    2,
    3,
    4,
    5,
    6
  ]
}

```

Tuple list can describe other SQL tokens, e.g.

```js
await connection.query(sql`
  INSERT INTO (foo, bar, baz)
  VALUES ${sql.tupleList([
    [1, sql`to_timestamp(${2})`, 3],
    [4, sql`to_timestamp(${5})`, 6]
  ])}
`);

```

Produces:

```js
{
  sql: 'INSERT INTO (foo, bar, baz) VALUES ($1, to_timestamp($2), $3), ($4, to_timestamp($5), $6)',
  values: [
    1,
    2,
    3,
    4,
    5,
    6
  ]
}

```

### `sql.unnest`

```js
(
  tuples: $ReadOnlyArray<$ReadOnlyArray<PrimitiveValueExpressionType>>,
  columnTypes: $ReadOnlyArray<string>
): UnnestSqlTokenType;

```

Creates an `unnest` expressions, e.g.

```js
await connection.query(sql`
  SELECT bar, baz
  FROM ${sql.unnest(
    [
      [1, 'foo'],
      [2, 'bar']
    ],
    [
      'int4',
      'text'
    ]
  )} AS foo(bar, baz)
`);

```

Produces:

```js
{
  sql: 'SELECT bar, baz FROM unnest($1::int4[], $2::text[]) AS foo(bar, baz)',
  values: [
    [
      1,
      2
    ],
    [
      'foo',
      'bar'
    ]
  ]
}

```

### `sql.valueList`

Note: Before using `sql.valueList` evaluate if [`sql.array`](#sqlarray) is not a better option.

```js
(
  values: $ReadOnlyArray<PrimitiveValueExpressionType>
) => ValueListSqlTokenType;

```

Creates a list of values, e.g.

```js
await connection.query(sql`
  SELECT (${sql.valueList([1, 2, 3])})
`);

```

Produces:

```js
{
  sql: 'SELECT ($1, $2, $3)',
  values: [
    1,
    2,
    3
  ]
}

```

Value list can describe other SQL tokens, e.g.

```js
await connection.query(sql`
  SELECT (${sql.valueList([1, sql`to_timestamp(${2})`, 3])})
`);

```

Produces:

```js
{
  sql: 'SELECT ($1, to_timestamp($2), $3)',
  values: [
    1,
    2,
    3
  ]
}

```
