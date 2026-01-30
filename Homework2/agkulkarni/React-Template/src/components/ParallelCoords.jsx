import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'

function pickKey(row, candidates) {
  if (!row) return null
  const keys = Object.keys(row)
  const lowerToActual = new Map(keys.map((k) => [k.toLowerCase(), k]))
  for (const c of candidates) {
    const actual = lowerToActual.get(c)
    if (actual) return actual
  }
  return null
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function formatLabel(key) {
  const spaced = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return spaced
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function variance(values) {
  if (!values || values.length < 2) return 0
  const mean = d3.mean(values) ?? 0
  const v = d3.mean(values, (d) => (d - mean) * (d - mean)) ?? 0
  return v
}

function preferredGroups() {
  return [
    ['publication_year', 'publicationyear', 'published_year', 'original_publication_year', 'year', 'publicationYear'],
    ['average_rating', 'rating_average', 'avg_rating', 'rating'],
    ['page_count', 'pagecount', 'pages', 'pageCount'],
    ['ratings_count', 'rating_count', 'num_ratings', 'ratingsCount'],
    ['swap_count', 'swapcount', 'exchange_count', 'exchangecount', 'swaps', 'exchangeCount', 'swapCount'],
    ['popularity_score', 'popularityscore', 'popularity', 'score'],
  ]
}

export default function ParallelCoords({ maxDims = 6, minDims = 4, height = 420, maxLines = 550 }) {
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)

  const [rows, setRows] = useState([])
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let cancelled = false
    d3.csv('/data/top_1000_most_swapped_books.csv', d3.autoType)
      .then((loaded) => {
        if (cancelled) return
        setRows(loaded)
      })
      .catch((err) => {
        console.error('Failed to load CSV:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0].contentRect.width)
      setWidth(next)
    })
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const prepared = useMemo(() => {
    if (!rows || rows.length === 0) return { dims: [], data: [], titleKey: null }
    const row0 = rows[0]
    const titleKey = pickKey(row0, ['title', 'book_title', 'name'])
    const keys = Object.keys(row0)
    const total = rows.length

    const excluded = new Set(['id', 'isbn'])
    const numericCandidates = keys
      .filter((k) => !excluded.has(k.toLowerCase()))
      .filter((k) => {
        for (const r of rows) {
          const v = r?.[k]
          if (isFiniteNumber(v)) return true
        }
        return false
      })

    const stats = numericCandidates
      .map((k) => {
        const values = rows.map((r) => r?.[k]).filter(isFiniteNumber)
        const validCount = values.length
        return { key: k, values, validCount, missingRatio: 1 - validCount / total, var: variance(values) }
      })
      .filter((d) => d.validCount > 0)
      .filter((d) => d.missingRatio <= 0.4)

    const keySet = new Set(stats.map((d) => d.key))
    const preferred = []
    for (const group of preferredGroups()) {
      for (const alias of group) {
        const actual = Array.from(keySet).find((k) => k.toLowerCase() === alias.toLowerCase())
        if (actual) {
          preferred.push(actual)
          break
        }
      }
    }

    const byVar = [...stats].sort((a, b) => d3.descending(a.var, b.var)).map((d) => d.key)
    const combined = []
    for (const k of preferred) if (!combined.includes(k)) combined.push(k)
    for (const k of byVar) if (!combined.includes(k)) combined.push(k)

    const maxPick = Math.max(1, Math.min(maxDims, combined.length))
    let dims = combined.slice(0, maxPick)

    if (dims.length > maxDims) dims = dims.slice(0, maxDims)
    if (dims.length < minDims) dims = combined.slice(0, Math.min(minDims, combined.length))

    const dimSet = new Set(dims)
    let data = rows
      .map((r) => {
        const rec = { raw: r, title: titleKey ? String(r?.[titleKey] ?? '') : '' }
        let missing = 0
        for (const d of dims) {
          const v = r?.[d]
          if (!isFiniteNumber(v)) missing += 1
          rec[d] = isFiniteNumber(v) ? v : null
        }
        rec.__missing = missing
        return rec
      })
      .filter((r) => r.__missing <= Math.floor(dims.length / 2))

    if (Number.isFinite(maxLines) && maxLines > 0 && data.length > maxLines) {
      data = data.slice(0, maxLines)
    }

    return { dims: Array.from(dimSet), data, titleKey }
  }, [rows, maxDims, minDims, maxLines])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    d3.select(container).selectAll('*').remove()
    if (!prepared.data || prepared.data.length === 0 || !prepared.dims || prepared.dims.length === 0 || width <= 0)
      return

    const margin = { top: 30, right: 30, bottom: 40, left: 30 }
    const innerWidth = Math.max(0, width - margin.left - margin.right)
    const innerHeight = Math.max(0, height - margin.top - margin.bottom)

    const dims = prepared.dims
    const x = d3.scalePoint().domain(dims).range([0, innerWidth]).padding(0.6)

    const yScales = new Map()
    for (const dim of dims) {
      const vals = prepared.data.map((d) => d[dim]).filter(isFiniteNumber)
      const ext = d3.extent(vals)
      const domain = ext[0] == null || ext[1] == null ? [0, 1] : ext
      yScales.set(dim, d3.scaleLinear().domain(domain).nice().range([innerHeight, 0]))
    }

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const tooltip =
      tooltipRef.current ??
      (() => {
        const div = document.createElement('div')
        div.className = 'd3-tooltip'
        div.style.opacity = '0'
        container.parentElement?.appendChild(div)
        tooltipRef.current = div
        return div
      })()

    const moveTooltip = (event) => {
      const rect = container.getBoundingClientRect()
      const xPos = event.clientX - rect.left + 12
      const yPos = event.clientY - rect.top + 12
      tooltip.style.left = `${xPos}px`
      tooltip.style.top = `${yPos}px`
    }

    const hideTooltip = () => {
      tooltip.style.opacity = '0'
    }

    const ratingKey = pickKey(rows?.[0], ['average_rating', 'rating_average', 'avg_rating', 'rating'])

    const showTooltip = (event, d) => {
      tooltip.style.opacity = '1'
      const title = d.title ? d.title : '(Untitled)'
      const rating = ratingKey && isFiniteNumber(d.raw?.[ratingKey]) ? d.raw[ratingKey] : null
      tooltip.innerHTML = rating == null ? `<div><strong>${title}</strong></div>` : `<div><strong>${title}</strong></div><div>Rating: ${rating}</div>`
      moveTooltip(event)
    }

    const line = d3.line()
    const pathFor = (d) =>
      line(
        dims
          .map((p) => {
            const v = d[p]
            if (!isFiniteNumber(v)) return null
            return [x(p), yScales.get(p)(v)]
          })
          .filter(Boolean),
      )

    g.append('g')
      .attr('class', 'pc-lines')
      .selectAll('path')
      .data(prepared.data)
      .join('path')
      .attr('class', 'pc-line')
      .attr('d', (d) => pathFor(d))
      .attr('fill', 'none')
      .attr('stroke', '#355c7d')
      .attr('stroke-opacity', 0.08)
      .attr('stroke-width', 1.25)
      .style('pointer-events', 'stroke')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', '#1b3a57').attr('stroke-opacity', 0.8).attr('stroke-width', 2.4)
        showTooltip(event, d)
      })
      .on('mousemove', function (event) {
        moveTooltip(event)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', '#355c7d').attr('stroke-opacity', 0.08).attr('stroke-width', 1.25)
        hideTooltip()
      })

    const axisG = g.append('g').attr('class', 'pc-axes')

    axisG
      .selectAll('g')
      .data(dims)
      .join('g')
      .attr('transform', (d) => `translate(${x(d)},0)`)
      .each(function (dim) {
        const scale = yScales.get(dim)
        d3.select(this).call(d3.axisLeft(scale).ticks(5).tickSizeOuter(0))
      })

    axisG
      .selectAll('text.pc-axis-label')
      .data(dims)
      .join('text')
      .attr('class', 'pc-axis-label')
      .attr('x', (d) => x(d))
      .attr('y', innerHeight + 28)
      .attr('text-anchor', 'middle')
      .text((d) => formatLabel(d))

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove()
        tooltipRef.current = null
      }
    }
  }, [prepared.data, prepared.dims, width, height, rows])

  return (
    <div className="chart-card">
      <div className="chart-title">Multivariate Comparison (Parallel Coordinates)</div>
      <div className="chart-subtitle">Each line represents a single book, enabling comparison across multiple numerical attributes.</div>
      <div className="chart-wrapper">
        <div ref={containerRef} className="chart-root" />
      </div>
    </div>
  )
}

