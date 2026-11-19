import React, { useRef, useState } from 'react';
import type {
  PdfBoxOrigin,
  PdfPoint,
  TakeoffMeasurement,
  TakeoffTool,
} from '../../types/bunyan';
import {
  pdfPointToViewportWithMediaBox,
  viewportPointToPdfWithMediaBox,
} from '../../utils/pdfMeasurementMath';
import { computeRectanglePoints } from '../../utils/takeoffCalculations';

interface PdfCanvasSheetProps {
  width: number;
  height: number;
  activeTool: TakeoffTool;
  activeColor: string;
  measurements: TakeoffMeasurement[];
  selectedMeasurementId: string | null;
  draftPoints: PdfPoint[];
  // For immutable 72-DPI PDF mode vs pre-calibrated SVG mode
  pdfMode?: {
    box: PdfBoxOrigin;
    zoomScale: number;
    viewportRotation: 0 | 90 | 180 | 270;
  };
  onAddPoint: (pt: PdfPoint) => void;
  onFinishShape: () => void;
  onSelectMeasurement: (id: string | null) => void;
  onCalibrateTwoPoints?: (p1: PdfPoint, p2: PdfPoint) => void;
}

export const PdfCanvasSheet: React.FC<PdfCanvasSheetProps> = ({
  width,
  height,
  activeTool,
  activeColor,
  measurements,
  selectedMeasurementId,
  draftPoints,
  pdfMode,
  onAddPoint,
  onFinishShape,
  onSelectMeasurement,
  onCalibrateTwoPoints,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverViewportPt, setHoverViewportPt] = useState<PdfPoint | null>(null);

  const toViewport = (pt: PdfPoint): PdfPoint => {
    if (!pdfMode) return pt;
    return pdfPointToViewportWithMediaBox(
      pt,
      pdfMode.box,
      pdfMode.zoomScale,
      pdfMode.viewportRotation
    );
  };

  const toStoredCoords = (clientX: number, clientY: number): PdfPoint => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * width;
    const vy = ((clientY - rect.top) / rect.height) * height;
    if (!pdfMode) return { x: vx, y: vy };
    return viewportPointToPdfWithMediaBox(
      { x: vx, y: vy },
      pdfMode.box,
      pdfMode.zoomScale,
      pdfMode.viewportRotation
    );
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select' || activeTool === 'pan') {
      return;
    }
    const storedPt = toStoredCoords(e.clientX, e.clientY);

    if (activeTool === 'calibrate' && onCalibrateTwoPoints) {
      if (draftPoints.length === 1) {
        onCalibrateTwoPoints(draftPoints[0], storedPt);
        return;
      }
      onAddPoint(storedPt);
      return;
    }

    if (activeTool === 'rectangle' && draftPoints.length === 1) {
      onAddPoint(storedPt);
      setTimeout(() => onFinishShape(), 0);
      return;
    }

    onAddPoint(storedPt);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setHoverViewportPt({
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    });
  };

  const renderShape = (
    pts: PdfPoint[],
    tool: TakeoffTool,
    color: string,
    isSelected: boolean,
    labelText?: string,
    id?: string
  ) => {
    const vPts = pts.map(toViewport);
    if (vPts.length === 0) return null;

    if (tool === 'count') {
      return (
        <g key={id} onClick={(e) => { e.stopPropagation(); if (id) onSelectMeasurement(id); }}>
          {vPts.map((p, idx) => (
            <g key={idx} className="cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r={isSelected ? 8 : 6}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
              />
              <text
                x={p.x + 9}
                y={p.y - 6}
                fill="#F8FAFC"
                fontSize="10"
                fontFamily="monospace"
              >
                #{idx + 1}
              </text>
            </g>
          ))}
        </g>
      );
    }

    if (tool === 'linear' || tool === 'polyline' || tool === 'calibrate') {
      const pointsStr = vPts.map((p) => `${p.x},${p.y}`).join(' ');
      const last = vPts[vPts.length - 1];
      return (
        <g key={id} onClick={(e) => { e.stopPropagation(); if (id) onSelectMeasurement(id); }} className="cursor-pointer">
          <polyline
            points={pointsStr}
            fill="none"
            stroke={isSelected ? '#FDE047' : color}
            strokeWidth={isSelected ? 4 : 2.5}
            strokeDasharray={tool === 'calibrate' ? '6 4' : undefined}
          />
          {vPts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke={color} strokeWidth="2" />
          ))}
          {labelText && (
            <text x={last.x + 8} y={last.y - 8} fill="#F8FAFC" fontSize="11" fontFamily="monospace" stroke="#0B1324" strokeWidth="0.4">
              {labelText}
            </text>
          )}
        </g>
      );
    }

    // Closed polygons / rectangles / areas / volumes / perimeter / deduction
    const polyPts =
      tool === 'rectangle' && vPts.length === 2
        ? computeRectanglePoints(vPts[0], vPts[1])
        : vPts;
    const pointsStr = polyPts.map((p) => `${p.x},${p.y}`).join(' ');
    const cx = polyPts.reduce((s, p) => s + p.x, 0) / polyPts.length;
    const cy = polyPts.reduce((s, p) => s + p.y, 0) / polyPts.length;

    return (
      <g key={id} onClick={(e) => { e.stopPropagation(); if (id) onSelectMeasurement(id); }} className="cursor-pointer">
        <polygon
          points={pointsStr}
          fill={tool === 'deduction' ? 'rgba(244,63,94,0.25)' : `${color}38`}
          stroke={isSelected ? '#FDE047' : tool === 'deduction' ? '#F43F5E' : color}
          strokeWidth={isSelected ? 3.5 : 2}
          strokeDasharray={tool === 'deduction' ? '5 4' : undefined}
        />
        {polyPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#ffffff" stroke={color} strokeWidth="1.5" />
        ))}
        {labelText && polyPts.length >= 3 && (
          <g transform={`translate(${cx}, ${cy})`}>
            <rect x="-56" y="-11" width="112" height="22" rx="4" fill="rgba(15,23,42,0.85)" stroke={color} strokeWidth="1" />
            <text textAnchor="middle" y="4" fill="#F8FAFC" fontSize="10.5" fontFamily="monospace" fontWeight="600">
              {labelText}
            </text>
          </g>
        )}
      </g>
    );
  };

  const draftViewportPts = draftPoints.map(toViewport);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (draftPoints.length >= 2 || (activeTool === 'count' && draftPoints.length >= 1)) {
          onFinishShape();
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverViewportPt(null)}
      className={`absolute inset-0 w-full h-full ${
        activeTool === 'pan'
          ? 'cursor-grab'
          : activeTool === 'select'
          ? 'cursor-default'
          : 'cursor-crosshair'
      }`}
    >
      {/* Committed Measurements */}
      {measurements.map((m) =>
        renderShape(
          m.points,
          m.tool,
          m.color,
          m.id === selectedMeasurementId,
          `${m.computedQuantity.toFixed(2)} ${m.unit}`,
          m.id
        )
      )}

      {/* Active Draft Geometry */}
      {draftViewportPts.length > 0 && (
        <g>
          {draftViewportPts.map((p, idx) => (
            <circle key={idx} cx={p.x} cy={p.y} r="4.5" fill={activeColor} stroke="#ffffff" strokeWidth="1.5" />
          ))}
          {draftViewportPts.length >= 2 && (
            <polyline
              points={draftViewportPts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={activeColor}
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}
          {hoverViewportPt && activeTool !== 'count' && (
            <line
              x1={draftViewportPts[draftViewportPts.length - 1].x}
              y1={draftViewportPts[draftViewportPts.length - 1].y}
              x2={hoverViewportPt.x}
              y2={hoverViewportPt.y}
              stroke={activeColor}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}
        </g>
      )}
    </svg>
  );
};
