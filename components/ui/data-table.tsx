"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type DataColumn = { id: string; label: string; align?: "end"; className?: string };
export type DataRow = { id: string; cells: Record<string, ReactNode>; className?: string; label?: string };

export function DataTable({ label, columns, rows, selected = [], onSelectionChange, bulkActions, empty }: {
  label: string;
  columns: readonly DataColumn[];
  rows: readonly DataRow[];
  selected?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  bulkActions?: ReactNode;
  empty?: ReactNode;
}) {
  const selectAll = useRef<HTMLInputElement>(null);
  const selectedSet = new Set(selected);
  const selectedVisible = rows.filter(row => selectedSet.has(row.id)).length;
  const allChecked = !!rows.length && selectedVisible === rows.length;
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedVisible > 0 && !allChecked;
  }, [allChecked, selectedVisible]);

  return <div className="cwl-ui-data-table">
    {!!selected.length && onSelectionChange && <div className="cwl-ui-bulkbar">
      <strong>{selected.length} selected</strong><div>{bulkActions}</div>
    </div>}
    <div className="cwl-ui-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table aria-label={label}>
        <thead><tr>
          {onSelectionChange && <th className="cwl-ui-table-checkbox" scope="col">
            <input ref={selectAll} type="checkbox" aria-label="Select all visible rows" checked={allChecked} disabled={!rows.length}
              onChange={event => {
                const visible = new Set(rows.map(row => row.id));
                onSelectionChange(event.target.checked ? [...new Set([...selected, ...visible])] : selected.filter(id => !visible.has(id)));
              }} />
          </th>}
          {columns.map(column => <th key={column.id} data-align={column.align} scope="col" className={column.className}>{column.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.id} className={row.className}>
            {onSelectionChange && <td className="cwl-ui-table-checkbox">
              <input type="checkbox" aria-label={row.label ? `Select ${row.label}` : "Select row"} checked={selectedSet.has(row.id)}
                onChange={event => onSelectionChange(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} />
            </td>}
            {columns.map(column => <td key={column.id} data-align={column.align}>{row.cells[column.id]}</td>)}
          </tr>)}
          {!rows.length && !!empty && <tr><td colSpan={columns.length + (onSelectionChange ? 1 : 0)}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
