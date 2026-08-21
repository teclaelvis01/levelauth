/** Lightweight UA / client summary for admin session lists (Netflix-style). */

export type ClientInfo = {
  browser: string
  os: string
  device: string
  label: string
}

export function parseUserAgent (ua: string | null | undefined): ClientInfo {
  const raw = (ua || '').trim()
  if (!raw) {
    return { browser: 'Desconocido', os: 'Desconocido', device: 'Otro', label: 'Dispositivo desconocido' }
  }

  const device = /iPad|Tablet/i.test(raw)
    ? 'Tablet'
    : /Mobile|Android.*Mobile|iPhone|iPod/i.test(raw)
      ? 'Móvil'
      : 'Escritorio'

  let os = 'Desconocido'
  if (/Windows NT 10/i.test(raw)) os = 'Windows 10+'
  else if (/Windows NT 6\.3/i.test(raw)) os = 'Windows 8.1'
  else if (/Windows NT 6\.1/i.test(raw)) os = 'Windows 7'
  else if (/Windows/i.test(raw)) os = 'Windows'
  else if (/Mac OS X ([\d_]+)/i.test(raw)) {
    const m = raw.match(/Mac OS X ([\d_]+)/i)
    os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS'
  } else if (/Android ([\d.]+)/i.test(raw)) {
    const m = raw.match(/Android ([\d.]+)/i)
    os = m ? `Android ${m[1]}` : 'Android'
  } else if (/iPhone OS ([\d_]+)/i.test(raw) || /CPU OS ([\d_]+)/i.test(raw)) {
    const m = raw.match(/(?:iPhone OS|CPU OS) ([\d_]+)/i)
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS'
  } else if (/Linux/i.test(raw)) os = 'Linux'
  else if (/CrOS/i.test(raw)) os = 'Chrome OS'

  let browser = 'Desconocido'
  if (/Edg\/([\d.]+)/i.test(raw)) {
    const m = raw.match(/Edg\/([\d.]+)/i)
    browser = m ? `Edge ${m[1].split('.')[0]}` : 'Edge'
  } else if (/OPR\/([\d.]+)/i.test(raw) || /Opera/i.test(raw)) {
    const m = raw.match(/OPR\/([\d.]+)/i)
    browser = m ? `Opera ${m[1].split('.')[0]}` : 'Opera'
  } else if (/Firefox\/([\d.]+)/i.test(raw)) {
    const m = raw.match(/Firefox\/([\d.]+)/i)
    browser = m ? `Firefox ${m[1].split('.')[0]}` : 'Firefox'
  } else if (/Chrome\/([\d.]+)/i.test(raw) && !/Edg\//i.test(raw)) {
    const m = raw.match(/Chrome\/([\d.]+)/i)
    browser = m ? `Chrome ${m[1].split('.')[0]}` : 'Chrome'
  } else if (/Safari\/([\d.]+)/i.test(raw) && /Version\/([\d.]+)/i.test(raw)) {
    const m = raw.match(/Version\/([\d.]+)/i)
    browser = m ? `Safari ${m[1].split('.')[0]}` : 'Safari'
  }

  return {
    browser,
    os,
    device,
    label: `${browser} · ${os}`
  }
}
