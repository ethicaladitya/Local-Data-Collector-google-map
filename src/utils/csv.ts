import { CSV_COLUMNS, type Business } from '../types/business'

/** Escape a single CSV field per RFC 4180 (quote if it contains , " or a newline). */
function escapeCsvField(value: string | number | null): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Map a Business record to a row of values in CSV_COLUMNS order. */
function toRow(business: Business): (string | number | null)[] {
  return [
    business.name,
    business.category,
    business.rating,
    business.reviewCount,
    business.address,
    business.phone,
    business.website,
    business.hours,
    business.latitude,
    business.longitude,
    business.description,
    business.reviewsSummary,
  ]
}

/** Serialize a list of businesses into a CSV string (header + rows). */
export function businessesToCsv(businesses: Business[]): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const business of businesses) {
    lines.push(toRow(business).map(escapeCsvField).join(','))
  }
  // CRLF is the RFC 4180 line ending and plays best with Excel.
  return lines.join('\r\n')
}

/** Trigger a browser download of the given businesses as a CSV file. */
export function downloadBusinessesCsv(businesses: Business[], filename = 'businesses.csv'): void {
  const csv = businessesToCsv(businesses)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
