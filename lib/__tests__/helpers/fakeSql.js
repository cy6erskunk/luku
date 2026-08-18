/**
 * Stand-in for the tagged-template query function returned by getDb().
 *
 * Usage:
 *   const sql = fakeSql([[rowA], []]);   // queued result per call, in order
 *   await sql`SELECT ...`;
 *   sql.calls[0].text                    // "SELECT ..." with $1, $2 placeholders
 *   sql.calls[0].values                  // interpolated values
 */
export function fakeSql(results = []) {
  const queue = [...results];
  const calls = [];

  const sql = (strings, ...values) => {
    calls.push({
      text: strings.raw.map((s, i) => (i ? `$${i}` : "") + s).join("").trim(),
      strings: [...strings],
      values,
    });
    const next = queue.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next ?? []);
  };

  sql.calls = calls;
  sql.queue = (...rows) => queue.push(...rows);
  return sql;
}
