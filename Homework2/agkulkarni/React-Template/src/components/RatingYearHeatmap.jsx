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

function toNumber(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function decadeOf(year) {
  return Math.floor(year / 10) * 10
}

function ratingBinOf(rating) {
  const b = Math.floor(rating / 0.5) * 0.5
  return Math.round(b * 10) / 10
}

function ratingRangeLabel(bin) {
  const lo = bin.toFixed(1)
  const hi = (bin + 0.5).toFixed(1)
  return `${lo}–${hi}`
}

export default function RatingYearHeatmap({ height = 400, minYear = 1900, maxYear = null }) {
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
    if (!rows || rows.length === 0) return { data: [], decades: [], ratingBins: [], maxCount: 0 }

    const row0 = rows[0]
    const titleKey = pickKey(row0, ['title', 'book_title', 'name'])
    const yearKey = pickKey(row0, [
      'publication_year',
      'published_year',
      'original_publication_year',
      'year',
      'publicationyear',
      'publicationYear',
    ])
    const ratingKey = pickKey(row0, ['average_rating', 'avg_rating', 'rating', 'rating_average'])

    if (!yearKey || !ratingKey) return { data: [], decades: [], ratingBins: [], maxCount: 0 }

    const items = rows
      .map((r) => {
        const year = toNumber(r?.[yearKey])
        const rating = toNumber(r?.[ratingKey])
        if (year === null || rating === null) return null
        if (typeof minYear === 'number' && Number.isFinite(minYear) && year < minYear) return null
        if (typeof maxYear === 'number' && Number.isFinite(maxYear) && year > maxYear) return null
        const dec = decadeOf(year)
        const bin = ratingBinOf(rating)
        const title = titleKey ? String(r?.[titleKey] ?? '') : ''
        return { decade: dec, ratingBin: bin, title }
      })
      .filter(Boolean)

    const decades = Array.from(new Set(items.map((d) => d.decade))).sort((a, b) => d3.ascending(a, b))
    const ratingBins = Array.from(new Set(items.map((d) => d.ratingBin))).sort((a, b) => d3.ascending(a, b))

    const counts = new Map()
    for (const d of items) {
      const key = `${d.decade}|${d.ratingBin}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const data = []
    let maxCount = 0
    for (const dec of decades) {
      for (const bin of ratingBins) {
        const key = `${dec}|${bin}`
        const count = counts.get(key) ?? 0
        if (count > maxCount) maxCount = count
        data.push({ decade: dec, ratingBin: bin, count })
      }
    }

    return { data, decades, ratingBins, maxCount }
  }, [rows])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    d3.select(container).selectAll('*').remove()
    if (!prepared.data || prepared.data.length === 0 || width <= 0) return

    const margin = { top: 20, right: 20, bottom: 70, left: 80 }
    const legendHeight = 46
    const innerWidth = Math.max(0, width - margin.left - margin.right)
    const innerHeight = Math.max(0, height - margin.top - margin.bottom - legendHeight)

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3
      .scaleBand()
      .domain(prepared.decades.map(String))
      .range([0, innerWidth])
      .paddingInner(0.08)
      .paddingOuter(0.02)

    const y = d3
      .scaleBand()
      .domain(prepared.ratingBins.map((d) => d.toFixed(1)))
      .range([innerHeight, 0])
      .paddingInner(0.08)
      .paddingOuter(0.02)

    const maxCount = Math.max(1, prepared.maxCount)
    const color = d3
      .scaleSequential((t) => d3.interpolateBlues(0.25 + 0.75 * t))
      .domain([1, maxCount])

    const xAxis = d3
      .axisBottom(x)
      .tickSizeOuter(0)
      .tickValues(prepared.decades.filter((d, i) => i % Math.max(1, Math.floor(prepared.decades.length / 10)) === 0).map(String))

    const yAxis = d3.axisLeft(y).tickSizeOuter(0)

    g.append('g').attr('transform', `translate(0,${innerHeight})`).call(xAxis)
    g.append('g').call(yAxis)

    svg
      .append('text')
      .attr('class', 'axis-label')
      .attr('x', margin.left + innerWidth / 2)
      .attr('y', height - 12)
      .attr('text-anchor', 'middle')
      .text('Publication Decade')

    svg
      .append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + innerHeight / 2))
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .text('Average Rating')

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
      tooltip.style.left = `${event.clientX - rect.left + 12}px`
      tooltip.style.top = `${event.clientY - rect.top + 12}px`
    }

    const showTooltip = (event, d) => {
      tooltip.style.opacity = '1'
      tooltip.innerHTML = `<div><strong>Decade: ${d.decade}s</strong></div><div>Rating: ${ratingRangeLabel(d.ratingBin)}</div><div>Books: ${d.count}</div>`
      moveTooltip(event)
    }

    const hideTooltip = () => {
      tooltip.style.opacity = '0'
    }

    g.append('g')
      .selectAll('rect')
      .data(prepared.data)
      .join('rect')
      .attr('x', (d) => x(String(d.decade)) ?? 0)
      .attr('y', (d) => y(d.ratingBin.toFixed(1)) ?? 0)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.count <= 0 ? '#eef2f7' : color(d.count)))
      .attr('stroke', 'rgba(0,0,0,0.06)')
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip)

    const legendWidth = Math.min(260, innerWidth)
    const legendX = margin.left + innerWidth - legendWidth
    const legendY = margin.top + innerHeight + 34

    const defs = svg.append('defs')
    const gradId = 'heatmapLegendGradient'
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%')

    const stops = 18
    for (let i = 0; i <= stops; i += 1) {
      const t = i / stops
      gradient
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', d3.interpolateBlues(0.25 + 0.75 * t))
    }

    svg
      .append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', 10)
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', 'rgba(0,0,0,0.18)')
      .attr('rx', 2)

    const legendScale = d3.scaleLinear().domain([1, maxCount]).range([0, legendWidth])
    const legendAxis = d3.axisBottom(legendScale).ticks(4).tickSizeOuter(0)

    svg
      .append('g')
      .attr('transform', `translate(${legendX},${legendY + 10})`)
      .call(legendAxis)

    svg
      .append('text')
      .attr('x', legendX)
      .attr('y', legendY - 6)
      .attr('text-anchor', 'start')
      .attr('class', 'legend-label')
      .text('Number of Books')

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove()
        tooltipRef.current = null
      }
    }
  }, [prepared, width, height])

  return (
    <div className="chart-card">
      <div className="chart-title">Distribution of Book Ratings Over Time</div>
      <div className="chart-subtitle">Displays how book rating distributions vary across publication decades.</div>
      <div className="chart-wrapper">
        <div ref={containerRef} className="chart-root" />
      </div>
    </div>
  )
}

