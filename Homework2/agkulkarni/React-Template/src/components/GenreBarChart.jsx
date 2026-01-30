import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'

function normalizeGenreKey(row) {
  if (!row) return null
  const keys = Object.keys(row)
  const key = keys.find((k) => {
    const lower = k.toLowerCase()
    return lower === 'genres' || lower === 'genre'
  })
  return key ?? null
}

function aggregateGenres(rows, topN) {
  if (!rows || rows.length === 0) return []

  const genreKey = normalizeGenreKey(rows[0])
  if (!genreKey) return []

  const counts = new Map()
  for (const row of rows) {
    const raw = row?.[genreKey]
    if (!raw) continue
    const parts = String(raw)
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
    for (const g of parts) {
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
  }

  const out = Array.from(counts, ([genre, count]) => ({ genre, count }))
  out.sort((a, b) => d3.descending(a.count, b.count))
  return out.slice(0, topN)
}

export default function GenreBarChart({ topN = 10, height = 320 }) {
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)

  const [rows, setRows] = useState([])
  const [width, setWidth] = useState(0)

  const data = useMemo(() => aggregateGenres(rows, topN), [rows, topN])

  useEffect(() => {
    let cancelled = false
    d3.csv('/data/top_1000_most_swapped_books.csv')
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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    d3.select(container).selectAll('*').remove()

    if (!data || data.length === 0 || width <= 0) return

    const margin = { top: 18, right: 16, bottom: 80, left: 70 }
    const innerWidth = Math.max(0, width - margin.left - margin.right)
    const innerHeight = Math.max(0, height - margin.top - margin.bottom)

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.genre))
      .range([0, innerWidth])
      .padding(0.2)

    const yMax = d3.max(data, (d) => d.count) ?? 0
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(1, yMax)])
      .nice()
      .range([innerHeight, 0])

    const xAxis = d3.axisBottom(x).tickSizeOuter(0)
    const yAxis = d3.axisLeft(y).ticks(6).tickSizeOuter(0)

    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)

    xAxisG
      .selectAll('text')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-40)')
      .attr('dx', '-0.6em')
      .attr('dy', '0.25em')

    g.append('g').call(yAxis)

    svg
      .append('text')
      .attr('class', 'axis-label')
      .attr('x', margin.left + innerWidth / 2)
      .attr('y', height - 12)
      .attr('text-anchor', 'middle')
      .text('Genre')

    svg
      .append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(margin.top + innerHeight / 2))
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .text('Number of Books')

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

    const showTooltip = (event, d) => {
      tooltip.style.opacity = '1'
      tooltip.innerHTML = `<div><strong>${d.genre}</strong></div><div>Count: ${d.count}</div>`
      moveTooltip(event)
    }

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

    g.selectAll('rect.bar')
      .data(data, (d) => d.genre)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.genre) ?? 0)
      .attr('y', (d) => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', (d) => innerHeight - y(d.count))
      .on('mouseenter', (event, d) => showTooltip(event, d))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip)

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove()
        tooltipRef.current = null
      }
    }
  }, [data, width, height])

  return (
    <div className="chart-card">
      <div className="chart-title">Overview: Top Genres by Swapped Book Count</div>
      <div className="chart-subtitle">Shows which book genres appear most frequently among popular book exchanges.</div>
      <div className="chart-wrapper">
        <div ref={containerRef} className="chart-root" />
      </div>
    </div>
  )
}

