import { useEffect, useRef } from 'react';

interface Shape {
    vertices: [number, number, number][];
    edges: [number, number][];
    rx: number;
    ry: number;
    rz: number;
    vx: number;
    vy: number;
    px: number;
    py: number;
    scale: number;
    color: string;
}

export default function Math3DBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, isDown: false, activeShape: -1 });
    const shapesRef = useRef<Shape[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const getShapeLayout = (idx: number, isMob: boolean) => {
            if (isMob) {
                switch (idx) {
                    case 0: return { px: 0.22, py: 0.16 };
                    case 1: return { px: 0.78, py: 0.46 };
                    case 2: return { px: 0.25, py: 0.85 };
                    case 3: return { px: 0.78, py: 0.72 };
                    case 4: return { px: 0.50, py: 0.08 };
                    case 5: return { px: 0.15, py: 0.52 };
                    case 6: return { px: 0.85, py: 0.58 };
                    default: return { px: 0.5, py: 0.5 };
                }
            } else {
                switch (idx) {
                    case 0: return { px: 0.15, py: 0.28 };
                    case 1: return { px: 0.83, py: 0.22 };
                    case 2: return { px: 0.78, py: 0.78 };
                    case 3: return { px: 0.35, py: 0.82 };
                    case 4: return { px: 0.52, py: 0.12 };
                    case 5: return { px: 0.12, py: 0.65 };
                    case 6: return { px: 0.88, py: 0.52 };
                    default: return { px: 0.5, py: 0.5 };
                }
            }
        };

        const phi = (1 + Math.sqrt(5)) / 2;
        const invPhi = 1 / phi;
        const dodecaVertices: [number, number, number][] = [
            [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
            [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
            [0, -invPhi, -phi], [0, -invPhi, phi], [0, invPhi, -phi], [0, invPhi, phi],
            [-invPhi, -phi, 0], [-invPhi, phi, 0], [invPhi, -phi, 0], [invPhi, phi, 0],
            [-phi, 0, -invPhi], [-phi, 0, invPhi], [phi, 0, -invPhi], [phi, 0, invPhi]
        ].map(([x, y, z]) => [x * 0.8, y * 0.8, z * 0.8]);

        const dodecaEdges: [number, number][] = [];
        const dodecaEdgeLen = 2 / phi;
        for (let i = 0; i < dodecaVertices.length; i++) {
            for (let j = i + 1; j < dodecaVertices.length; j++) {
                const dx = dodecaVertices[i][0] - dodecaVertices[j][0];
                const dy = dodecaVertices[i][1] - dodecaVertices[j][1];
                const dz = dodecaVertices[i][2] - dodecaVertices[j][2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (Math.abs(dist - dodecaEdgeLen * 0.8) < 0.05) {
                    dodecaEdges.push([i, j]);
                }
            }
        }

        const torusVertices: [number, number, number][] = [];
        const torusEdges: [number, number][] = [];
        const torusR = 0.9;
        const torusr = 0.35;
        const stepsU = 8;
        const stepsV = 12;
        for (let i = 0; i < stepsU; i++) {
            const theta = (i / stepsU) * Math.PI * 2;
            for (let j = 0; j < stepsV; j++) {
                const phiVal = (j / stepsV) * Math.PI * 2;
                const x = (torusR + torusr * Math.cos(theta)) * Math.cos(phiVal);
                const y = (torusR + torusr * Math.cos(theta)) * Math.sin(phiVal);
                const z = torusr * Math.sin(theta);
                torusVertices.push([x, y, z]);
            }
        }
        for (let i = 0; i < stepsU; i++) {
            for (let j = 0; j < stepsV; j++) {
                const current = i * stepsV + j;
                const nextU = ((i + 1) % stepsU) * stepsV + j;
                const nextV = i * stepsV + ((j + 1) % stepsV);
                torusEdges.push([current, nextU]);
                torusEdges.push([current, nextV]);
            }
        }

        const saddleVertices: [number, number, number][] = [];
        const saddleEdges: [number, number][] = [];
        const gridRes = 5;
        for (let i = 0; i <= gridRes; i++) {
            const x = (i / gridRes) * 2 - 1;
            for (let j = 0; j <= gridRes; j++) {
                const y = (j / gridRes) * 2 - 1;
                const z = (x * x - y * y) * 0.6;
                saddleVertices.push([x * 0.9, y * 0.9, z]);
            }
        }
        const stride = gridRes + 1;
        for (let i = 0; i <= gridRes; i++) {
            const rowOffset = i * stride;
            for (let j = 0; j <= gridRes; j++) {
                const current = rowOffset + j;
                if (i < gridRes) saddleEdges.push([current, (i + 1) * stride + j]);
                if (j < gridRes) saddleEdges.push([current, rowOffset + j + 1]);
            }
        }

        const plusVertices: [number, number, number][] = [
            [-0.5, -0.12, -0.12], [0.5, -0.12, -0.12], [0.5, 0.12, -0.12], [-0.5, 0.12, -0.12],
            [-0.5, -0.12, 0.12], [0.5, -0.12, 0.12], [0.5, 0.12, 0.12], [-0.5, 0.12, 0.12],
            [-0.12, -0.5, -0.12], [0.12, -0.5, -0.12], [0.12, 0.5, -0.12], [-0.12, 0.5, -0.12],
            [-0.12, -0.5, 0.12], [0.12, -0.5, 0.12], [0.12, 0.5, 0.12], [-0.12, 0.5, 0.12]
        ];
        const plusEdges: [number, number][] = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7],
            [8, 9], [9, 10], [10, 11], [11, 8],
            [12, 13], [13, 14], [14, 15], [15, 12],
            [8, 12], [9, 13], [10, 14], [11, 15]
        ];

        const minusVertices: [number, number, number][] = [
            [-0.45, -0.1, -0.1], [0.45, -0.1, -0.1], [0.45, 0.1, -0.1], [-0.45, 0.1, -0.1],
            [-0.45, -0.1, 0.1], [0.45, -0.1, 0.1], [0.45, 0.1, 0.1], [-0.45, 0.1, 0.1]
        ];
        const minusEdges: [number, number][] = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        const rotAngle = Math.PI / 4;
        const timesVertices = plusVertices.map(([x, y, z]) => {
            const rx = x * Math.cos(rotAngle) - y * Math.sin(rotAngle);
            const ry = x * Math.sin(rotAngle) + y * Math.cos(rotAngle);
            return [rx, ry, z] as [number, number, number];
        });
        const timesEdges = plusEdges;

        const divideVertices: [number, number, number][] = [
            [-0.45, -0.09, -0.09], [0.45, -0.09, -0.09], [0.45, 0.09, -0.09], [-0.45, 0.09, -0.09],
            [-0.45, -0.09, 0.09], [0.45, -0.09, 0.09], [0.45, 0.09, 0.09], [-0.45, 0.09, 0.09],
            [-0.08, 0.27, -0.08], [0.08, 0.27, -0.08], [0.08, 0.43, -0.08], [-0.08, 0.43, -0.08],
            [-0.08, 0.27, 0.08], [0.08, 0.27, 0.08], [0.08, 0.43, 0.08], [-0.08, 0.43, 0.08],
            [-0.08, -0.43, -0.08], [0.08, -0.43, -0.08], [0.08, -0.27, -0.08], [-0.08, -0.27, -0.08],
            [-0.08, -0.43, 0.08], [0.08, -0.43, 0.08], [0.08, -0.27, 0.08], [-0.08, -0.27, 0.08]
        ];
        const divideEdges: [number, number][] = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7],
            [8, 9], [9, 10], [10, 11], [11, 8],
            [12, 13], [13, 14], [14, 15], [15, 12],
            [8, 12], [9, 13], [10, 14], [11, 15],
            [16, 17], [17, 18], [18, 19], [19, 16],
            [20, 21], [21, 22], [22, 23], [23, 20],
            [16, 20], [17, 21], [18, 22], [19, 23]
        ];

        shapesRef.current = [
            {
                vertices: dodecaVertices,
                edges: dodecaEdges,
                rx: 0.2, ry: 0.3, rz: 0.1,
                vx: 0.002, vy: 0.003,
                px: 0.15, py: 0.28,
                scale: 65,
                color: 'rgba(217, 119, 6, 0.16)'
            },
            {
                vertices: torusVertices,
                edges: torusEdges,
                rx: 0.5, ry: 0.2, rz: 0.3,
                vx: 0.003, vy: 0.002,
                px: 0.83, py: 0.22,
                scale: 68,
                color: 'rgba(120, 113, 108, 0.18)'
            },
            {
                vertices: saddleVertices,
                edges: saddleEdges,
                rx: 0.4, ry: 0.5, rz: 0.2,
                vx: 0.002, vy: 0.002,
                px: 0.78, py: 0.78,
                scale: 70,
                color: 'rgba(217, 119, 6, 0.15)'
            },
            {
                vertices: plusVertices,
                edges: plusEdges,
                rx: 0.3, ry: 0.4, rz: 0.15,
                vx: 0.002, vy: 0.003,
                px: 0.35, py: 0.82,
                scale: 48,
                color: 'rgba(120, 113, 108, 0.18)'
            },
            {
                vertices: minusVertices,
                edges: minusEdges,
                rx: 0.1, ry: 0.6, rz: 0.25,
                vx: 0.003, vy: 0.001,
                px: 0.52, py: 0.12,
                scale: 44,
                color: 'rgba(217, 119, 6, 0.15)'
            },
            {
                vertices: timesVertices,
                edges: timesEdges,
                rx: 0.6, ry: 0.1, rz: 0.4,
                vx: 0.001, vy: 0.002,
                px: 0.12, py: 0.65,
                scale: 48,
                color: 'rgba(217, 119, 6, 0.16)'
            },
            {
                vertices: divideVertices,
                edges: divideEdges,
                rx: 0.2, ry: 0.5, rz: 0.3,
                vx: 0.002, vy: 0.002,
                px: 0.88, py: 0.52,
                scale: 46,
                color: 'rgba(120, 113, 108, 0.18)'
            }
        ];

        const handleMouseDown = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            mouseRef.current.isDown = true;
            mouseRef.current.lastX = mouseX;
            mouseRef.current.lastY = mouseY;
            mouseRef.current.activeShape = -1;

            let minDist = 80;
            shapesRef.current.forEach((_, index) => {
                const isMobile = window.innerWidth < 768;
                const { px, py } = getShapeLayout(index, isMobile);

                const cx = canvas.width * px;
                const cy = canvas.height * py;
                const dist = Math.hypot(mouseX - cx, mouseY - cy);
                if (dist < minDist) {
                    minDist = dist;
                    mouseRef.current.activeShape = index;
                }
            });
        };

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            mouseRef.current.x = (mouseX / canvas.width) * 2 - 1;
            mouseRef.current.y = (mouseY / canvas.height) * 2 - 1;

            if (mouseRef.current.isDown && mouseRef.current.activeShape !== -1) {
                const dx = mouseX - mouseRef.current.lastX;
                const dy = mouseY - mouseRef.current.lastY;
                const shape = shapesRef.current[mouseRef.current.activeShape];

                shape.ry += dx * 0.008;
                shape.rx += dy * 0.008;
                shape.vy = dx * 0.015;
                shape.vx = dy * 0.015;

                mouseRef.current.lastX = mouseX;
                mouseRef.current.lastY = mouseY;
            }
        };

        const handleMouseUp = () => {
            mouseRef.current.isDown = false;
            mouseRef.current.activeShape = -1;
        };

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        let animationFrameId: number;

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const isMobile = window.innerWidth < 768;

            shapesRef.current.forEach((shape, index) => {
                if (!mouseRef.current.isDown || mouseRef.current.activeShape !== index) {
                    shape.ry += shape.vy;
                    shape.rx += shape.vx;
                    shape.vy *= 0.95;
                    shape.vx *= 0.95;

                    shape.ry += 0.002;
                    shape.rx += 0.001;
                }

                const { px: layoutX, py: layoutY } = getShapeLayout(index, isMobile);
                let currentScale = shape.scale;

                if (isMobile) {
                    currentScale = shape.scale * 0.62;
                }

                const parallaxX = mouseRef.current.x * 22;
                const parallaxY = mouseRef.current.y * 22;

                const cx = canvas.width * layoutX + parallaxX;
                const cy = canvas.height * layoutY + parallaxY;

                const dist = 3.5;
                const fov = 350;

                const projectedPoints: { x: number; y: number }[] = [];

                shape.vertices.forEach(([x, y, z]) => {
                    const y1 = y * Math.cos(shape.rx) - z * Math.sin(shape.rx);
                    const z1 = y * Math.sin(shape.rx) + z * Math.cos(shape.rx);

                    const x2 = x * Math.cos(shape.ry) + z1 * Math.sin(shape.ry);
                    const z2 = -x * Math.sin(shape.ry) + z1 * Math.cos(shape.ry);

                    const x3 = x2 * Math.cos(shape.rz) - y1 * Math.sin(shape.rz);
                    const y3 = x2 * Math.sin(shape.rz) + y1 * Math.cos(shape.rz);

                    const scaleFactor = fov / (dist + z2);
                    const px = cx + x3 * scaleFactor * currentScale * 0.01;
                    const py = cy + y3 * scaleFactor * currentScale * 0.01;

                    projectedPoints.push({ x: px, y: py });
                });

                ctx.beginPath();
                ctx.strokeStyle = shape.color;
                ctx.lineWidth = 1.3;
                shape.edges.forEach(([u, v]) => {
                    const p1 = projectedPoints[u];
                    const p2 = projectedPoints[v];
                    if (p1 && p2) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                    }
                });
                ctx.stroke();

                projectedPoints.forEach((p) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                    ctx.fillStyle = shape.color.replace('0.15', '0.3').replace('0.16', '0.3').replace('0.18', '0.35');
                    ctx.fill();
                });
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-auto select-none"
            style={{ zIndex: 0 }}
        />
    );
}
