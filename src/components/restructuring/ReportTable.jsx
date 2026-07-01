import React from 'react';

/**
 * Schlichte, nüchterne Tabelle für Sanierungs-Reports.
 * columns: [{ key, label, align?: 'right'|'left', className?, render?: (row)=>node }]
 * rows: array of objects
 * totalRow: optional array aligned to columns (strings/nodes) for a bold summary row
 */
export default function ReportTable({ columns, rows, totalRow, rowClassName, emptyText = 'Keine Daten.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`py-2 px-2 font-semibold text-muted-foreground whitespace-nowrap ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={row.id || row.key || i}
              className={`border-b border-border/50 ${rowClassName ? rowClassName(row) : ''}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-1.5 px-2 tabular-nums ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className || ''}`}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalRow && (
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              {totalRow.map((cell, i) => (
                <td
                  key={i}
                  className={`py-2 px-2 tabular-nums ${columns[i]?.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}