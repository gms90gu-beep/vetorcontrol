/** A daily work record with a completion status or end timestamp is closed. */
export function isDailyWorkRecordClosed(record: {
  status?: string | null;
  end_time?: string | null;
} | null | undefined): boolean {
  return !!record && (record.status === "completed" || !!record.end_time);
}
