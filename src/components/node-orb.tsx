"use client";

import { useEffect, useRef } from "react";

interface NodeOrbProps {
  size?: number;
  isActive?: boolean;
}

interface Node {
  // 단위 구 표면 좌표 (x^2+y^2+z^2 = 1)
  bx: number;
  by: number;
  bz: number;
  // 미세 떠다니기
  vx: number;
  vy: number;
}

export function NodeOrb({ size = 180, isActive = false }: NodeOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const angleRef = useRef(0);
  const pulseRef = useRef(0);
  const activeRef = useRef(isActive);
  const animRef = useRef<number>(0);

  activeRef.current = isActive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const orbRadius = size * 0.36;
    const nodeCount = 70;
    const connectionDist = size * 0.2;

    // 피보나치 구 표면에 균등 배치
    if (nodesRef.current.length === 0) {
      const nodes: Node[] = [];
      for (let i = 0; i < nodeCount; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / nodeCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        nodes.push({
          bx: Math.sin(phi) * Math.cos(theta),
          by: Math.sin(phi) * Math.sin(theta),
          bz: Math.cos(phi),
          vx: 0,
          vy: 0,
        });
      }
      nodesRef.current = nodes;
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);

      const active = activeRef.current;
      angleRef.current += active ? 0.007 : 0.003;
      pulseRef.current += active ? 0.05 : 0.02;

      const angle = angleRef.current;
      const pulseScale = 1 + Math.sin(pulseRef.current) * (active ? 0.06 : 0.03);

      const nodes = nodesRef.current;

      // Y축 회전 + X축 틸트
      const cosY = Math.cos(angle);
      const sinY = Math.sin(angle);
      const tilt = angle * 0.3;
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);

      const projected: Array<{ x: number; y: number; z: number; r: number }> = [];

      for (const node of nodes) {
        // Y축 회전
        const rx = node.bx * cosY + node.bz * sinY;
        const ry = node.by;
        const rz = -node.bx * sinY + node.bz * cosY;

        // X축 틸트
        const fx = rx;
        const fy = ry * cosX - rz * sinX;
        const fz = ry * sinX + rz * cosX;

        const r = orbRadius * pulseScale;
        const depth = (fz + 1) / 2; // 0(뒤) ~ 1(앞)

        // 미세 떠다니기
        node.vx += (Math.random() - 0.5) * 0.08;
        node.vy += (Math.random() - 0.5) * 0.08;
        node.vx *= 0.94;
        node.vy *= 0.94;

        projected.push({
          x: cx + fx * r + node.vx,
          y: cy + fy * r + node.vy,
          z: depth,
          r: 1.0 + depth * 1.2,
        });
      }

      // 연결선 (깊이 가중치 적용)
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const depthAvg = (projected[i].z + projected[j].z) / 2;
            const alpha = (1 - dist / connectionDist) * 0.35 * depthAvg;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.strokeStyle = `rgba(120, 130, 255, ${alpha})`;
            ctx.lineWidth = 0.6 * depthAvg;
            ctx.stroke();
          }
        }
      }

      // 노드
      for (const p of projected) {
        const alpha = 0.15 + p.z * 0.85;
        const nr = p.r * (active ? 1.3 : 1);

        // 글로우
        ctx.beginPath();
        ctx.arc(p.x, p.y, nr * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 120, 255, ${alpha * 0.08})`;
        ctx.fill();

        // 코어
        ctx.beginPath();
        ctx.arc(p.x, p.y, nr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 130, 255, ${alpha})`;
        ctx.fill();
      }

      // 중앙 글로우
      const ga = active ? 0.06 + Math.sin(pulseRef.current * 2) * 0.03 : 0.03;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius * 0.7);
      grad.addColorStop(0, `rgba(139, 92, 246, ${ga})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
    />
  );
}
